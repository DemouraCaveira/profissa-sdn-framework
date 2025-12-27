from __future__ import annotations

import asyncio
import json
import os
import random
import re
import subprocess
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Sequence
from uuid import uuid4

from fastapi import Depends, FastAPI, Header, HTTPException, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from platform.backend.core.metrics import ensure_labels
from platform.backend.config_loader import (
    flows_from_config,
    load_platform_config,
    metric_definitions_from_config,
    metric_layer_flags,
    topology_from_config,
)
from platform.backend.schemas import (
    Experiment,
    ExperimentCreate,
    ExperimentRun,
    ExperimentUpdate,
    FlowRule,
    MetricDefinition,
    MetricLayer,
    MetricQuery,
    MetricRecord,
    MetricSample,
    Topology,
    TopologyCreate,
    TopologyUpdate,
)

app = FastAPI(title="Profissa SDN Platform API", version="0.1.0")

api_key = os.getenv("API_KEY")
allowed_origins = os.getenv(
    "CORS_ALLOW_ORIGINS",
    "http://localhost:5173,http://localhost:5174,http://127.0.0.1:5173,http://127.0.0.1:5174",
).split(",")
config_path = os.getenv("PLATFORM_CONFIG_PATH", "platform/experiments/platform_config.json")
raw_dir = Path("raw")
raw_dir.mkdir(parents=True, exist_ok=True)
software_version = (
    os.getenv("SOFTWARE_VERSION")
    or Path("VERSION").read_text(encoding="utf-8").strip()
    if Path("VERSION").exists()
    else "dev"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in allowed_origins if origin.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _generate_id(prefix: str) -> str:
    return f"{prefix}_{uuid4().hex[:8]}"


def _raw_file_for_layer(layer: MetricLayer) -> Path:
    return raw_dir / f"metrics_{layer}.jsonl"


def _serialize_sample(sample: MetricSample) -> str:
    return json.dumps(
        {
            "timestamp": sample.timestamp.isoformat(),
            "node": sample.node,
            "layer": sample.layer,
            "metric": sample.metric,
            "value": sample.value,
            "details": sample.details,
            "labels": sample.labels,
        }
    )


def _write_samples_to_raw(samples: Sequence[MetricSample]) -> None:
    for sample in samples:
        path = _raw_file_for_layer(sample.layer)
        with path.open("a", encoding="utf-8") as f:
            f.write(_serialize_sample(sample) + "\n")


def _load_recent_samples_from_raw(limit: int = 200) -> List[MetricSample]:
    loaded: List[MetricSample] = []

    def _tail(path: Path, max_lines: int) -> List[str]:
        if not path.exists():
            return []
        with path.open("r", encoding="utf-8") as f:
            lines = f.readlines()
        return lines[-max_lines:]

    for layer in [
        "physical",
        "link",
        "network",
        "transport",
        "application",
        "control",
        "dataplane",
    ]:
        for line in _tail(_raw_file_for_layer(layer), limit):
            try:
                obj = json.loads(line)
                loaded.append(
                    MetricSample(
                        timestamp=datetime.fromisoformat(obj.get("timestamp")),
                        node=obj.get("node", ""),
                        layer=obj.get("layer", layer),
                        metric=obj.get("metric", ""),
                        value=float(obj.get("value", 0)),
                        details=obj.get("details") or {},
                        labels=_normalize_labels(obj.get("labels") or {}),
                    )
                )
            except Exception:
                continue
    return loaded


def _normalize_labels(labels: Dict[str, Any] | None) -> Dict[str, Any]:
    normalized = ensure_labels(labels or {})
    normalized.setdefault("version", software_version)
    return normalized


def _normalize_sample(sample: MetricSample) -> MetricSample:
    return MetricSample(
        timestamp=sample.timestamp,
        node=sample.node,
        layer=sample.layer,
        metric=sample.metric,
        value=sample.value,
        details=sample.details,
        labels=_normalize_labels(sample.labels),
    )


def _append_run_log(run_id: str, message: str) -> None:
    run = runs.get(run_id)
    if not run:
        return
    entry = f"{datetime.utcnow().isoformat()} {message}"
    run.logs.append(entry)


def _store_samples(samples: Sequence[MetricSample]) -> None:
    normalized = [_normalize_sample(sample) for sample in samples]
    metric_samples.extend(normalized)
    _write_samples_to_raw(normalized)
    for sample in normalized:
        run_id = sample.labels.get("run_id") if sample.labels else None
        if run_id:
            record = MetricRecord(
                timestamp=sample.timestamp,
                metric_name=sample.metric,
                value=sample.value,
                layer=sample.layer,
                labels=sample.labels,
                details=sample.details,
            )
            run_metrics.setdefault(run_id, []).append(record)
            _append_run_log(run_id, f"metric:{sample.metric}")


def _run_cmd(cmd: List[str], timeout: int = 6) -> str:
    try:
        res = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout, check=True)
        return res.stdout
    except (subprocess.SubprocessError, OSError):
        return ""


def _parse_ss_summary(output: str) -> Dict[str, float]:
    summary: Dict[str, float] = {
        "total": 0,
        "tcp_total": 0,
        "tcp_estab": 0,
        "tcp_closed": 0,
        "tcp_orphaned": 0,
        "tcp_timewait": 0,
    }
    matrix: Dict[str, Dict[str, float]] = {proto: {"total": 0, "ip": 0, "ipv6": 0} for proto in ["udp", "tcp", "raw", "inet", "frag"]}
    for line in output.splitlines():
        if line.startswith("Total:"):
            m = re.search(r"Total:\s+(\d+)", line)
            if m:
                summary["total"] = float(m.group(1))
        if line.startswith("TCP:"):
            m = re.search(r"TCP:\s+(\d+).*estab\s+(\d+), closed\s+(\d+), orphaned\s+(\d+), timewait\s+(\d+)", line)
            if m:
                summary.update(
                    {
                        "tcp_total": float(m.group(1)),
                        "tcp_estab": float(m.group(2)),
                        "tcp_closed": float(m.group(3)),
                        "tcp_orphaned": float(m.group(4)),
                        "tcp_timewait": float(m.group(5)),
                    }
                )
        if any(line.startswith(prefix) for prefix in ["UDP", "TCP", "RAW", "INET", "FRAG"]):
            parts = line.split()
            if len(parts) >= 4:
                proto = parts[0].lower()
                try:
                    total, ip_v4, ip_v6 = float(parts[1]), float(parts[2]), float(parts[3])
                    matrix.setdefault(proto, {"total": 0, "ip": 0, "ipv6": 0})
                    matrix[proto].update({"total": total, "ip": ip_v4, "ipv6": ip_v6})
                except ValueError:
                    continue
    return {**summary, **{f"{proto}_{k}": v for proto, vals in matrix.items() for k, v in vals.items()}}


def _parse_snmp(output: str) -> Dict[str, float]:
    lines = [ln for ln in output.splitlines() if ":" in ln]
    results: Dict[str, float] = {}
    i = 0
    while i < len(lines) - 1:
        header = lines[i].split()
        values = lines[i + 1].split()
        if header[0].rstrip(":") == values[0].rstrip(":"):
            prefix = header[0].rstrip(":").lower()
            keys = header[1:]
            vals = values[1:]
            for k, v in zip(keys, vals):
                try:
                    results[f"{prefix}_{k.lower()}"] = float(v)
                except ValueError:
                    continue
        i += 2
    return results


def _parse_ip_link(output: str) -> Dict[str, Dict[str, float]]:
    # Returns iface -> metrics
    metrics: Dict[str, Dict[str, float]] = {}
    current = None
    for line in output.splitlines():
        if re.match(r"^\d+: ", line):
            current = line.split(":", 1)[1].strip().split()[0]
            metrics.setdefault(current, {})
        if current and "RX:" in line:
            continue
        if current and "TX:" in line:
            continue
        if current and "errors" in line and "dropped" in line:
            parts = line.split()
            try:
                errors = float(parts[1])
                dropped = float(parts[3])
                metrics[current].setdefault("errors", 0.0)
                metrics[current].setdefault("dropped", 0.0)
                metrics[current]["errors"] += errors
                metrics[current]["dropped"] += dropped
            except (IndexError, ValueError):
                continue
    return metrics


def _collect_real(topology: Topology | None, labels: Dict[str, Any] | None = None) -> List[MetricSample]:
    if not topology:
        return []
    now = datetime.utcnow()
    base_labels = _normalize_labels(labels)
    samples: List[MetricSample] = []

    def _mk(metric: str, layer: MetricLayer, node: str, value: float, details: Dict | None = None, labels: Dict | None = None) -> MetricSample:
        return MetricSample(
            timestamp=now,
            node=node,
            layer=layer,
            metric=metric,
            value=value,
            details=details or {},
            labels=_normalize_labels(labels or base_labels),
        )

    for node in topology.nodes:
        container = node.meta.get("container_name") or node.id
        # Transport: ss -s and /proc/net/snmp
        if layer_flags.get("transport", True):
            ss_output = _run_cmd(["docker", "exec", container, "ss", "-s"]) if container else ""
            ss_data = _parse_ss_summary(ss_output) if ss_output else {}
            if ss_data:
                samples.append(_mk("ss_sockets_total", "transport", node.id, ss_data.get("total", 0.0), {"source": "ss -s"}))
                samples.append(
                    _mk(
                        "ss_tcp_states",
                        "transport",
                        node.id,
                        ss_data.get("tcp_total", 0.0),
                        {
                            "estab": ss_data.get("tcp_estab", 0.0),
                            "closed": ss_data.get("tcp_closed", 0.0),
                            "orphaned": ss_data.get("tcp_orphaned", 0.0),
                            "timewait": ss_data.get("tcp_timewait", 0.0),
                            "source": "ss -s",
                        },
                    )
                )
                for proto in ["udp", "tcp", "raw", "inet", "frag"]:
                    samples.append(
                        _mk(
                            f"ss_{proto}_sockets_total",
                            "transport",
                            node.id,
                            ss_data.get(f"{proto}_total", 0.0),
                            {
                                "ip": ss_data.get(f"{proto}_ip", 0.0),
                                "ipv6": ss_data.get(f"{proto}_ipv6", 0.0),
                                "source": "ss -s",
                            },
                        )
                    )

            snmp_output = _run_cmd(["docker", "exec", container, "cat", "/proc/net/snmp"]) if container else ""
            snmp_data = _parse_snmp(snmp_output) if snmp_output else {}
            for key, val in snmp_data.items():
                samples.append(_mk(f"snmp_{key}", "transport", node.id, float(val), {"source": "/proc/net/snmp"}))

        # Link/Physical: ip -s link
        if layer_flags.get("link", True) or layer_flags.get("physical", True):
            ip_link_output = _run_cmd(["docker", "exec", container, "ip", "-s", "link"]) if container else ""
            ip_link_stats = _parse_ip_link(ip_link_output) if ip_link_output else {}
            for iface, vals in ip_link_stats.items():
                path = f"{node.id}:{iface}"
                if layer_flags.get("physical", True):
                    samples.append(_mk("if_errors", "physical", path, vals.get("errors", 0.0), {"source": "ip -s link"}))
                    samples.append(_mk("if_discards", "physical", path, vals.get("dropped", 0.0), {"source": "ip -s link"}))
                if layer_flags.get("link", True):
                    samples.append(_mk("queue_drops", "link", path, vals.get("dropped", 0.0), {"source": "ip -s link"}))

        # Network: basic ping between hosts (h1->h2, h2->h1 when mgmt_ip available)
        if layer_flags.get("network", True) and node.type == "host":
            peers = [n for n in topology.nodes if n.type == "host" and n.id != node.id and n.mgmt_ip]
            if peers:
                target = peers[0]
                ping_cmd = ["docker", "exec", container, "ping", "-c", "3", "-i", "0.2", target.mgmt_ip]
                ping_output = _run_cmd(ping_cmd)
                m = re.search(r"(\d+)% packet loss", ping_output)
                loss = float(m.group(1)) if m else 0.0
                rtt_match = re.search(r"rtt min/avg/max/mdev = ([0-9.]+)/([0-9.]+)/([0-9.]+)/([0-9.]+)", ping_output)
                if rtt_match:
                    latency = float(rtt_match.group(2))
                    jitter = float(rtt_match.group(4))
                else:
                    latency = 0.0
                    jitter = 0.0
                samples.append(_mk("latency_ms", "network", node.id, latency, {"dst": target.id, "source": "ping"}))
                samples.append(_mk("packet_loss_pct", "network", node.id, loss, {"dst": target.id, "source": "ping"}))
                samples.append(_mk("jitter_ms", "network", node.id, jitter, {"dst": target.id, "source": "ping"}))

        # Control/Dataplane (best-effort with ovs-ofctl on switches)
        if node.type == "switch" and layer_flags.get("control", True):
            ofctl_ports = _run_cmd(["docker", "exec", container, "ovs-ofctl", "dump-ports", "br-s1"]) if container else ""
            if ofctl_ports:
                samples.append(_mk("controller_conn_ok", "control", node.id, 1.0, {"source": "ovs-ofctl"}))
        if node.type == "switch" and layer_flags.get("dataplane", True):
            flows_dump = _run_cmd(["docker", "exec", container, "ovs-ofctl", "dump-flows", "br-s1"]) if container else ""
            if flows_dump:
                lines = [ln for ln in flows_dump.splitlines() if "n_packets" in ln]
                for idx, ln in enumerate(lines[:10]):
                    m_pkts = re.search(r"n_packets=(\d+)", ln)
                    m_bytes = re.search(r"n_bytes=(\d+)", ln)
                    pkts = float(m_pkts.group(1)) if m_pkts else 0.0
                    byt = float(m_bytes.group(1)) if m_bytes else 0.0
                    samples.append(_mk("openflow_flow_packets", "dataplane", node.id, pkts, {"flow_id": f"flow_{idx}", "source": "ovs-ofctl"}))
                    samples.append(_mk("openflow_flow_bytes", "dataplane", node.id, byt, {"flow_id": f"flow_{idx}", "source": "ovs-ofctl"}))
    return samples


def _collect_synthetic_full(topology: Topology | None, labels: Dict[str, Any] | None = None) -> List[MetricSample]:
    if not topology:
        return []
    now = datetime.utcnow()
    base_labels = _normalize_labels(labels)
    samples: List[MetricSample] = []

    def _mk(metric: str, layer: MetricLayer, node: str, value: float, details: Dict | None = None, labels: Dict | None = None) -> MetricSample:
        return MetricSample(
            timestamp=now,
            node=node,
            layer=layer,
            metric=metric,
            value=value,
            details=details or {},
            labels=_normalize_labels(labels or base_labels),
        )

    if layer_flags.get("physical", True):
        for link in topology.links:
            path = f"{link.source}->{link.target}"
            samples.append(_mk("if_errors", "physical", path, float(random.randint(0, 3))))
            samples.append(_mk("if_discards", "physical", path, float(random.randint(0, 3))))
            samples.append(_mk("if_crc_errors", "physical", path, float(random.randint(0, 2))))
            samples.append(_mk("if_in_util_pct", "physical", path, round(random.uniform(10, 80), 3)))
            samples.append(_mk("if_out_util_pct", "physical", path, round(random.uniform(10, 80), 3)))
            samples.append(_mk("if_temp_c", "physical", path, round(random.uniform(35, 65), 2)))
            samples.append(_mk("if_optic_rx_dbm", "physical", path, round(random.uniform(-6.0, -1.0), 2)))
            samples.append(_mk("if_optic_tx_dbm", "physical", path, round(random.uniform(-2.0, 2.0), 2)))

    if layer_flags.get("link", True):
        for link in topology.links:
            path = f"{link.source}->{link.target}"
            util = random.uniform(5, 90)
            jitter = random.uniform(0, 5)
            loss = random.uniform(0, 2)
            samples.append(_mk("link_util_pct", "link", path, round(util, 2), {"direction": "bidirectional"}))
            samples.append(_mk("link_loss_pct", "link", path, round(loss, 3)))
            samples.append(_mk("link_jitter_ms", "link", path, round(jitter, 3)))
            samples.append(_mk("queue_occupancy_pct", "link", link.source, round(random.uniform(0, 70), 2)))
            samples.append(_mk("queue_drops", "link", link.source, float(random.randint(0, 20))))
            samples.append(_mk("ecn_marked_pct", "link", path, round(random.uniform(0, 1), 3)))

    if layer_flags.get("network", True):
        for node in topology.nodes:
            if node.type in {"host", "switch"}:
                rtt = random.uniform(0.2, 8.0)
                loss = random.uniform(0, 3.0)
                jitter = random.uniform(0, 2.0)
                samples.append(_mk("latency_ms", "network", node.id, round(rtt, 3)))
                samples.append(_mk("packet_loss_pct", "network", node.id, round(loss, 3)))
                samples.append(_mk("jitter_ms", "network", node.id, round(jitter, 3)))
                samples.append(_mk("ttl_expired", "network", node.id, float(random.randint(0, 2))))
                samples.append(_mk("routes_count", "network", node.id, float(random.randint(1, 32))))
                samples.append(_mk("arp_entries", "network", node.id, float(random.randint(1, 64))))

    if layer_flags.get("transport", True):
        for node in topology.nodes:
            if node.type == "host":
                samples.append(_mk("throughput_mbps", "transport", node.id, round(random.uniform(50, 900), 2)))
                samples.append(_mk("tcp_retrans_pct", "transport", node.id, round(random.uniform(0, 5), 3)))
                samples.append(_mk("tcp_rtt_ms", "transport", node.id, round(random.uniform(1, 30), 3)))
                samples.append(_mk("udp_jitter_ms", "transport", node.id, round(random.uniform(0, 5), 3)))
                samples.append(_mk("udp_loss_pct", "transport", node.id, round(random.uniform(0, 5), 3)))

                # ss -s synthetic snapshot
                ss_totals = {
                    "total": random.randint(2, 12),
                    "tcp_total": random.randint(1, 12),
                    "tcp_estab": random.randint(0, 4),
                    "tcp_closed": random.randint(8, 16),
                    "tcp_orphaned": random.randint(0, 1),
                    "tcp_timewait": random.randint(0, 4),
                }
                udp_ip = random.randint(0, 3)
                udp_ipv6 = random.randint(0, 3)
                tcp_ip = random.randint(0, 3)
                tcp_ipv6 = random.randint(0, 3)
                raw_ip = random.randint(0, 1)
                raw_ipv6 = random.randint(0, 1)
                ss_transport_matrix = {
                    "udp": {"total": udp_ip + udp_ipv6, "ip": udp_ip, "ipv6": udp_ipv6},
                    "tcp": {"total": tcp_ip + tcp_ipv6, "ip": tcp_ip, "ipv6": tcp_ipv6},
                    "raw": {"total": raw_ip + raw_ipv6, "ip": raw_ip, "ipv6": raw_ipv6},
                    "inet": {"total": (udp_ip + udp_ipv6 + tcp_ip + tcp_ipv6), "ip": udp_ip + tcp_ip, "ipv6": udp_ipv6 + tcp_ipv6},
                    "frag": {"total": random.randint(0, 1), "ip": random.randint(0, 1), "ipv6": 0},
                }

                samples.append(_mk("ss_sockets_total", "transport", node.id, float(ss_totals["total"]), {"source": "ss -s"}))
                samples.append(
                    _mk(
                        "ss_tcp_states",
                        "transport",
                        node.id,
                        float(ss_totals["tcp_total"]),
                        {
                            "estab": ss_totals["tcp_estab"],
                            "closed": ss_totals["tcp_closed"],
                            "orphaned": ss_totals["tcp_orphaned"],
                            "timewait": ss_totals["tcp_timewait"],
                            "source": "ss -s",
                        },
                    )
                )
                for proto, counts in ss_transport_matrix.items():
                    samples.append(
                        _mk(
                            f"ss_{proto}_sockets_total",
                            "transport",
                            node.id,
                            float(counts["total"]),
                            {"ip": counts["ip"], "ipv6": counts["ipv6"], "source": "ss -s"},
                        )
                    )

                # /proc/net/snmp synthetic snapshot
                ip_snmp = {
                    "in_receives": random.randint(10, 200),
                    "in_hdr_errors": random.randint(0, 2),
                    "in_addr_errors": random.randint(0, 2),
                    "forw_datagrams": random.randint(0, 3),
                    "in_unknown_protos": random.randint(0, 1),
                    "in_discards": random.randint(0, 2),
                    "in_delivers": random.randint(5, 25),
                    "out_requests": random.randint(5, 25),
                    "out_discards": random.randint(0, 2),
                    "out_no_routes": random.randint(0, 1),
                    "reasm_timeout": 0,
                    "reasm_reqds": random.randint(0, 1),
                    "reasm_oks": random.randint(0, 1),
                    "reasm_fails": random.randint(0, 1),
                    "frag_oks": random.randint(0, 1),
                    "frag_fails": random.randint(0, 1),
                    "frag_creates": random.randint(0, 1),
                    "out_transmits": random.randint(5, 25),
                }
                icmp_snmp = {
                    "in_msgs": random.randint(0, 10),
                    "out_msgs": random.randint(0, 10),
                    "in_errors": random.randint(0, 1),
                    "out_errors": random.randint(0, 1),
                    "in_dest_unreachs": random.randint(0, 1),
                    "out_dest_unreachs": random.randint(0, 1),
                    "in_time_excds": random.randint(0, 1),
                    "out_time_excds": random.randint(0, 1),
                    "in_echo_reqs": random.randint(0, 5),
                    "out_echo_reps": random.randint(0, 5),
                }
                tcp_snmp = {
                    "active_opens": random.randint(0, 3),
                    "passive_opens": random.randint(0, 3),
                    "attempt_fails": random.randint(0, 1),
                    "estab_resets": random.randint(0, 1),
                    "curr_estab": random.randint(0, 2),
                    "in_segs": random.randint(0, 30),
                    "out_segs": random.randint(0, 30),
                    "retrans_segs": random.randint(0, 5),
                    "in_errs": random.randint(0, 1),
                    "out_rsts": random.randint(0, 1),
                    "in_csum_errors": random.randint(0, 1),
                }
                udp_snmp = {
                    "in_datagrams": random.randint(0, 10),
                    "no_ports": random.randint(0, 2),
                    "in_errors": random.randint(0, 1),
                    "out_datagrams": random.randint(0, 10),
                    "rcvbuf_errors": random.randint(0, 1),
                    "sndbuf_errors": random.randint(0, 1),
                    "in_csum_errors": random.randint(0, 1),
                    "ignored_multi": random.randint(0, 1),
                    "mem_errors": random.randint(0, 1),
                }

                for key, val in ip_snmp.items():
                    samples.append(_mk(f"snmp_ip_{key}", "transport", node.id, float(val), {"source": "/proc/net/snmp"}))
                for key, val in icmp_snmp.items():
                    samples.append(_mk(f"snmp_icmp_{key}", "transport", node.id, float(val), {"source": "/proc/net/snmp"}))
                for key, val in tcp_snmp.items():
                    samples.append(_mk(f"snmp_tcp_{key}", "transport", node.id, float(val), {"source": "/proc/net/snmp"}))
                for key, val in udp_snmp.items():
                    samples.append(_mk(f"snmp_udp_{key}", "transport", node.id, float(val), {"source": "/proc/net/snmp"}))

    if layer_flags.get("application", False):
        for node in topology.nodes:
            if node.type == "host":
                samples.append(_mk("http_latency_ms", "application", node.id, round(random.uniform(20, 400), 2), {"status_code": 200}))
                samples.append(_mk("http_success_pct", "application", node.id, 99.0))
                samples.append(_mk("dns_latency_ms", "application", node.id, round(random.uniform(5, 80), 2)))
                samples.append(_mk("dns_success_pct", "application", node.id, 99.0))
                samples.append(_mk("tls_handshake_ms", "application", node.id, round(random.uniform(30, 150), 2)))

    if layer_flags.get("control", True):
        for node in topology.nodes:
            if node.type == "controller":
                samples.append(_mk("controller_latency_ms", "control", node.id, round(random.uniform(1, 25), 3)))
                samples.append(_mk("controller_conn_ok", "control", node.id, 1.0, {"ok": True}))
                samples.append(_mk("of_channel_reconnects", "control", node.id, float(random.randint(0, 1))))
                samples.append(_mk("flows_installed", "control", node.id, float(random.randint(10, 500))))
                samples.append(_mk("flows_removed", "control", node.id, float(random.randint(0, 100))))

    if layer_flags.get("dataplane", True):
        for flow in flows.values():
            topo = flow.topology_id
            samples.append(_mk("openflow_flow_packets", "dataplane", topo, float(random.randint(10, 10_000)), {"flow_id": flow.id or ""}))
            samples.append(_mk("openflow_flow_bytes", "dataplane", topo, float(random.randint(1_000, 5_000_000)), {"flow_id": flow.id or ""}))
        for link in topology.links:
            port_path = f"{link.source}->{link.target}"
            samples.append(_mk("table_hits", "dataplane", port_path, float(random.randint(1_000, 10_000))))
            samples.append(_mk("table_misses", "dataplane", port_path, float(random.randint(0, 500))))
            samples.append(_mk("port_rx_pkts", "dataplane", port_path, float(random.randint(1_000, 100_000))))
            samples.append(_mk("port_tx_pkts", "dataplane", port_path, float(random.randint(1_000, 100_000))))
            samples.append(_mk("port_rx_drops", "dataplane", port_path, float(random.randint(0, 500))))
            samples.append(_mk("port_tx_drops", "dataplane", port_path, float(random.randint(0, 500))))

    return samples


def _filter_samples(query: MetricQuery) -> List[MetricSample]:
    results: List[MetricSample] = []
    for sample in metric_samples:
        if query.metric_names and sample.metric not in query.metric_names:
            continue
        if query.nodes and sample.node not in query.nodes:
            continue
        if query.layers and sample.layer not in query.layers:
            continue
        if query.start_time and sample.timestamp < query.start_time:
            continue
        if query.end_time and sample.timestamp > query.end_time:
            continue
        results.append(sample)
        if len(results) >= query.limit:
            break
    return results


def _sample_to_dict(sample: MetricSample) -> Dict[str, Any]:
    return {
        "timestamp": sample.timestamp.isoformat(),
        "node": sample.node,
        "layer": sample.layer,
        "metric": sample.metric,
        "value": sample.value,
        "details": sample.details,
        "labels": sample.labels,
    }


async def _event_stream():
    while True:
        topology = next(iter(topologies.values()), None)
        payload = {
            "type": "snapshot",
            "generated_at": datetime.utcnow().isoformat(),
            "topology": topology.model_dump() if topology else None,
            "metrics": [_sample_to_dict(s) for s in metric_samples[-200:]],
            "runs": [run.model_dump() for run in runs.values()],
        }
        yield f"data: {json.dumps(payload)}\n\n"
        await asyncio.sleep(2)


def require_api_key(x_api_key: str | None = Header(default=None)) -> None:
    if not api_key:
        return
    if x_api_key != api_key:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid API key")


# In-memory stores; replace with real database integrations later.
topologies: Dict[str, Topology] = {}
experiments: Dict[str, Experiment] = {}
runs: Dict[str, ExperimentRun] = {}
flows: Dict[str, FlowRule] = {}
run_metrics: Dict[str, List[MetricRecord]] = {}
metric_samples: List[MetricSample] = []
layer_flags: Dict[MetricLayer, bool] = metric_layer_flags({})
real_collection_default = os.getenv("REAL_COLLECTION", "0") == "1"
collection_interval_seconds = float(os.getenv("AUTO_COLLECT_INTERVAL", "5"))
_auto_collect_task: asyncio.Task | None = None


def _extended_metric_definitions() -> List[MetricDefinition]:
    return [
        # Physical/interface
        MetricDefinition(name="if_errors", description="Interface errors", unit="count", layer="physical"),
        MetricDefinition(name="if_discards", description="Interface discards", unit="count", layer="physical"),
        MetricDefinition(name="if_crc_errors", description="CRC errors", unit="count", layer="physical"),
        MetricDefinition(name="if_in_util_pct", description="Ingress utilization", unit="%", layer="physical"),
        MetricDefinition(name="if_out_util_pct", description="Egress utilization", unit="%", layer="physical"),
        MetricDefinition(name="if_temp_c", description="Interface temperature", unit="C", layer="physical"),
        MetricDefinition(name="if_optic_rx_dbm", description="Optical RX power", unit="dBm", layer="physical"),
        MetricDefinition(name="if_optic_tx_dbm", description="Optical TX power", unit="dBm", layer="physical"),
        # Link (L2)
        MetricDefinition(name="link_util_pct", description="Link utilization", unit="%", layer="link"),
        MetricDefinition(name="link_loss_pct", description="Link loss", unit="%", layer="link"),
        MetricDefinition(name="link_jitter_ms", description="Link jitter", unit="ms", layer="link"),
        MetricDefinition(name="queue_occupancy_pct", description="Queue occupancy", unit="%", layer="link"),
        MetricDefinition(name="queue_drops", description="Queue drops", unit="count", layer="link"),
        MetricDefinition(name="ecn_marked_pct", description="ECN marked traffic", unit="%", layer="link"),
        # Network (L3)
        MetricDefinition(name="latency_ms", description="Latency", unit="ms", layer="network"),
        MetricDefinition(name="packet_loss_pct", description="Packet loss", unit="%", layer="network"),
        MetricDefinition(name="jitter_ms", description="Jitter", unit="ms", layer="network"),
        MetricDefinition(name="ttl_expired", description="TTL expired events", unit="count", layer="network"),
        MetricDefinition(name="routes_count", description="Route entries", unit="count", layer="network"),
        MetricDefinition(name="arp_entries", description="ARP/ND cache entries", unit="count", layer="network"),
        # Transport (L4)
        MetricDefinition(name="throughput_mbps", description="Throughput", unit="Mbps", layer="transport"),
        MetricDefinition(name="tcp_retrans_pct", description="TCP retransmissions", unit="%", layer="transport"),
        MetricDefinition(name="tcp_rtt_ms", description="TCP RTT", unit="ms", layer="transport"),
        MetricDefinition(name="udp_jitter_ms", description="UDP jitter", unit="ms", layer="transport"),
        MetricDefinition(name="udp_loss_pct", description="UDP loss", unit="%", layer="transport"),
        MetricDefinition(name="ss_sockets_total", description="Total sockets from ss -s", unit="count", layer="transport"),
        MetricDefinition(name="ss_tcp_states", description="TCP states from ss -s", unit="count", layer="transport"),
        MetricDefinition(name="ss_udp_sockets_total", description="UDP sockets from ss -s", unit="count", layer="transport"),
        MetricDefinition(name="ss_tcp_sockets_total", description="TCP sockets from ss -s", unit="count", layer="transport"),
        MetricDefinition(name="ss_raw_sockets_total", description="RAW sockets from ss -s", unit="count", layer="transport"),
        MetricDefinition(name="ss_inet_sockets_total", description="INET sockets from ss -s", unit="count", layer="transport"),
        MetricDefinition(name="ss_frag_sockets_total", description="FRAG sockets from ss -s", unit="count", layer="transport"),
        MetricDefinition(name="snmp_ip_in_receives", description="IP InReceives", unit="count", layer="transport"),
        MetricDefinition(name="snmp_ip_in_hdr_errors", description="IP InHdrErrors", unit="count", layer="transport"),
        MetricDefinition(name="snmp_ip_in_addr_errors", description="IP InAddrErrors", unit="count", layer="transport"),
        MetricDefinition(name="snmp_ip_forw_datagrams", description="IP ForwDatagrams", unit="count", layer="transport"),
        MetricDefinition(name="snmp_ip_in_unknown_protos", description="IP InUnknownProtos", unit="count", layer="transport"),
        MetricDefinition(name="snmp_ip_in_discards", description="IP InDiscards", unit="count", layer="transport"),
        MetricDefinition(name="snmp_ip_in_delivers", description="IP InDelivers", unit="count", layer="transport"),
        MetricDefinition(name="snmp_ip_out_requests", description="IP OutRequests", unit="count", layer="transport"),
        MetricDefinition(name="snmp_ip_out_discards", description="IP OutDiscards", unit="count", layer="transport"),
        MetricDefinition(name="snmp_ip_out_no_routes", description="IP OutNoRoutes", unit="count", layer="transport"),
        MetricDefinition(name="snmp_ip_reasm_timeout", description="IP ReasmTimeout", unit="count", layer="transport"),
        MetricDefinition(name="snmp_ip_reasm_reqds", description="IP ReasmReqds", unit="count", layer="transport"),
        MetricDefinition(name="snmp_ip_reasm_oks", description="IP ReasmOKs", unit="count", layer="transport"),
        MetricDefinition(name="snmp_ip_reasm_fails", description="IP ReasmFails", unit="count", layer="transport"),
        MetricDefinition(name="snmp_ip_frag_oks", description="IP FragOKs", unit="count", layer="transport"),
        MetricDefinition(name="snmp_ip_frag_fails", description="IP FragFails", unit="count", layer="transport"),
        MetricDefinition(name="snmp_ip_frag_creates", description="IP FragCreates", unit="count", layer="transport"),
        MetricDefinition(name="snmp_ip_out_transmits", description="IP OutTransmits", unit="count", layer="transport"),
        MetricDefinition(name="snmp_icmp_in_msgs", description="ICMP InMsgs", unit="count", layer="transport"),
        MetricDefinition(name="snmp_icmp_out_msgs", description="ICMP OutMsgs", unit="count", layer="transport"),
        MetricDefinition(name="snmp_icmp_in_errors", description="ICMP InErrors", unit="count", layer="transport"),
        MetricDefinition(name="snmp_icmp_out_errors", description="ICMP OutErrors", unit="count", layer="transport"),
        MetricDefinition(name="snmp_icmp_in_dest_unreachs", description="ICMP InDestUnreachs", unit="count", layer="transport"),
        MetricDefinition(name="snmp_icmp_out_dest_unreachs", description="ICMP OutDestUnreachs", unit="count", layer="transport"),
        MetricDefinition(name="snmp_icmp_in_time_excds", description="ICMP InTimeExcds", unit="count", layer="transport"),
        MetricDefinition(name="snmp_icmp_out_time_excds", description="ICMP OutTimeExcds", unit="count", layer="transport"),
        MetricDefinition(name="snmp_icmp_in_echo_reqs", description="ICMP InEchos", unit="count", layer="transport"),
        MetricDefinition(name="snmp_icmp_out_echo_reps", description="ICMP OutEchoReps", unit="count", layer="transport"),
        MetricDefinition(name="snmp_tcp_active_opens", description="TCP ActiveOpens", unit="count", layer="transport"),
        MetricDefinition(name="snmp_tcp_passive_opens", description="TCP PassiveOpens", unit="count", layer="transport"),
        MetricDefinition(name="snmp_tcp_attempt_fails", description="TCP AttemptFails", unit="count", layer="transport"),
        MetricDefinition(name="snmp_tcp_estab_resets", description="TCP EstabResets", unit="count", layer="transport"),
        MetricDefinition(name="snmp_tcp_curr_estab", description="TCP CurrEstab", unit="count", layer="transport"),
        MetricDefinition(name="snmp_tcp_in_segs", description="TCP InSegs", unit="count", layer="transport"),
        MetricDefinition(name="snmp_tcp_out_segs", description="TCP OutSegs", unit="count", layer="transport"),
        MetricDefinition(name="snmp_tcp_retrans_segs", description="TCP RetransSegs", unit="count", layer="transport"),
        MetricDefinition(name="snmp_tcp_in_errs", description="TCP InErrs", unit="count", layer="transport"),
        MetricDefinition(name="snmp_tcp_out_rsts", description="TCP OutRsts", unit="count", layer="transport"),
        MetricDefinition(name="snmp_tcp_in_csum_errors", description="TCP InCsumErrors", unit="count", layer="transport"),
        MetricDefinition(name="snmp_udp_in_datagrams", description="UDP InDatagrams", unit="count", layer="transport"),
        MetricDefinition(name="snmp_udp_no_ports", description="UDP NoPorts", unit="count", layer="transport"),
        MetricDefinition(name="snmp_udp_in_errors", description="UDP InErrors", unit="count", layer="transport"),
        MetricDefinition(name="snmp_udp_out_datagrams", description="UDP OutDatagrams", unit="count", layer="transport"),
        MetricDefinition(name="snmp_udp_rcvbuf_errors", description="UDP RcvbufErrors", unit="count", layer="transport"),
        MetricDefinition(name="snmp_udp_sndbuf_errors", description="UDP SndbufErrors", unit="count", layer="transport"),
        MetricDefinition(name="snmp_udp_in_csum_errors", description="UDP InCsumErrors", unit="count", layer="transport"),
        MetricDefinition(name="snmp_udp_ignored_multi", description="UDP IgnoredMulti", unit="count", layer="transport"),
        MetricDefinition(name="snmp_udp_mem_errors", description="UDP MemErrors", unit="count", layer="transport"),
        # Application
        MetricDefinition(name="http_latency_ms", description="HTTP latency", unit="ms", layer="application"),
        MetricDefinition(name="http_success_pct", description="HTTP success", unit="%", layer="application"),
        MetricDefinition(name="dns_latency_ms", description="DNS latency", unit="ms", layer="application"),
        MetricDefinition(name="dns_success_pct", description="DNS success", unit="%", layer="application"),
        MetricDefinition(name="tls_handshake_ms", description="TLS handshake", unit="ms", layer="application"),
        # Control-plane
        MetricDefinition(name="controller_latency_ms", description="Controller latency", unit="ms", layer="control"),
        MetricDefinition(name="controller_conn_ok", description="Controller connectivity", unit="bool", layer="control"),
        MetricDefinition(name="of_channel_reconnects", description="OpenFlow reconnects", unit="count", layer="control"),
        MetricDefinition(name="flows_installed", description="Flows installed", unit="count", layer="control"),
        MetricDefinition(name="flows_removed", description="Flows removed", unit="count", layer="control"),
        # Dataplane
        MetricDefinition(name="openflow_flow_packets", description="Flow packets", unit="packets", layer="dataplane"),
        MetricDefinition(name="openflow_flow_bytes", description="Flow bytes", unit="bytes", layer="dataplane"),
        MetricDefinition(name="table_hits", description="Table hits", unit="count", layer="dataplane"),
        MetricDefinition(name="table_misses", description="Table misses", unit="count", layer="dataplane"),
        MetricDefinition(name="port_rx_pkts", description="Port RX packets", unit="packets", layer="dataplane"),
        MetricDefinition(name="port_tx_pkts", description="Port TX packets", unit="packets", layer="dataplane"),
        MetricDefinition(name="port_rx_drops", description="Port RX drops", unit="packets", layer="dataplane"),
        MetricDefinition(name="port_tx_drops", description="Port TX drops", unit="packets", layer="dataplane"),
    ]


# Defaults; may be overridden/augmented by platform_config.json.
metric_definitions: List[MetricDefinition] = _extended_metric_definitions()


def _bootstrap_from_config() -> None:
    global metric_definitions, layer_flags
    try:
        cfg = load_platform_config(config_path)
    except FileNotFoundError:
        return
    except ValueError as exc:
        raise RuntimeError(f"Invalid platform config: {exc}") from exc

    topology = topology_from_config(cfg)
    if topology and topology.id not in topologies:
        topologies[topology.id] = topology

    cfg_metrics = metric_definitions_from_config(cfg)
    if cfg_metrics:
        merged: Dict[str, MetricDefinition] = {m.name: m for m in _extended_metric_definitions()}
        merged.update({m.name: m for m in cfg_metrics})
        metric_definitions = list(merged.values())
    else:
        metric_definitions = _extended_metric_definitions()
    layer_flags = metric_layer_flags(cfg)

    raw_dir.mkdir(parents=True, exist_ok=True)
    for layer in layer_flags:
        _raw_file_for_layer(layer).touch(exist_ok=True)

    if topology:
        controller_ids = {c.get("id") for c in cfg.get("controllers", []) if c.get("id")}
        for flow in flows_from_config(cfg, topology.id, controller_ids):
            flow_id = flow.id or _generate_id("flow")
            flows[flow_id] = FlowRule(**flow.model_dump(exclude={"id"}), id=flow_id)


_bootstrap_from_config()

for layer in layer_flags:
    _raw_file_for_layer(layer).touch(exist_ok=True)

# Seed minimal samples on startup so raw files are not empty for demo/testing scenarios.
if not metric_samples:
    restored = _load_recent_samples_from_raw(limit=200)
    if restored:
        metric_samples.extend(restored)
    else:
        seeded = _collect_synthetic_full(next(iter(topologies.values()), None), {"version": software_version})
        if seeded:
            _store_samples(seeded)


async def _auto_collect_loop() -> None:
    """Continuously collect metrics to keep SSE populated."""
    while True:
        try:
            topology = next(iter(topologies.values()), None)
            if topology:
                labels = {"version": software_version}
                samples = _collect_real(topology, labels) if real_collection_default else _collect_synthetic_full(topology, labels)
                if samples:
                    _store_samples(samples)
        except Exception:
            # Avoid crashing the loop; log could be added here later.
            pass
        await asyncio.sleep(collection_interval_seconds)


@app.on_event("startup")
async def _start_auto_collect() -> None:
    global _auto_collect_task
    if _auto_collect_task is None:
        _auto_collect_task = asyncio.create_task(_auto_collect_loop())


@app.on_event("shutdown")
async def _stop_auto_collect() -> None:
    global _auto_collect_task
    if _auto_collect_task:
        _auto_collect_task.cancel()
        try:
            await _auto_collect_task
        except asyncio.CancelledError:
            pass


@app.post("/topologies", response_model=Topology, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_api_key)])
async def create_topology(payload: TopologyCreate) -> Topology:
    topology_id = _generate_id("topo")
    topology = Topology(id=topology_id, **payload.model_dump())
    topologies[topology_id] = topology
    return topology


@app.get("/topologies", response_model=List[Topology])
async def list_topologies() -> List[Topology]:
    return list(topologies.values())


@app.get("/topologies/{topology_id}", response_model=Topology)
async def get_topology(topology_id: str) -> Topology:
    topology = topologies.get(topology_id)
    if not topology:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Topology not found")
    return topology


@app.put("/topologies/{topology_id}", response_model=Topology, dependencies=[Depends(require_api_key)])
async def update_topology(topology_id: str, payload: TopologyUpdate) -> Topology:
    existing = topologies.get(topology_id)
    if not existing:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Topology not found")
    update_data = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if v is not None}
    merged = existing.model_dump()
    merged.update(update_data)
    updated = Topology(id=topology_id, **merged)
    topologies[topology_id] = updated
    return updated


@app.delete("/topologies/{topology_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_api_key)])
async def delete_topology(topology_id: str) -> Response:
    if topology_id not in topologies:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Topology not found")
    topologies.pop(topology_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.post("/experiments", response_model=Experiment, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_api_key)])
async def create_experiment(payload: ExperimentCreate) -> Experiment:
    if payload.topology_id not in topologies:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Topology not found")
    experiment_id = _generate_id("exp")
    experiment = Experiment(id=experiment_id, **payload.model_dump())
    experiments[experiment_id] = experiment
    return experiment


@app.get("/experiments", response_model=List[Experiment])
async def list_experiments() -> List[Experiment]:
    return list(experiments.values())


@app.get("/experiments/{experiment_id}", response_model=Experiment)
async def get_experiment(experiment_id: str) -> Experiment:
    experiment = experiments.get(experiment_id)
    if not experiment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Experiment not found")
    return experiment


@app.put("/experiments/{experiment_id}", response_model=Experiment, dependencies=[Depends(require_api_key)])
async def update_experiment(experiment_id: str, payload: ExperimentUpdate) -> Experiment:
    existing = experiments.get(experiment_id)
    if not existing:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Experiment not found")
    update_data = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if v is not None}
    merged = existing.model_dump()
    merged.update(update_data)
    updated = Experiment(id=experiment_id, **merged)
    experiments[experiment_id] = updated
    return updated


@app.delete("/experiments/{experiment_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_api_key)])
async def delete_experiment(experiment_id: str) -> Response:
    if experiment_id not in experiments:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Experiment not found")
    experiments.pop(experiment_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.post(
    "/experiments/{experiment_id}/run",
    response_model=ExperimentRun,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_api_key)],
)
async def start_run(experiment_id: str) -> ExperimentRun:
    experiment = experiments.get(experiment_id)
    if not experiment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Experiment not found")
    run_id = _generate_id("run")
    run = ExperimentRun(
        id=run_id,
        experiment_id=experiment_id,
        topology_id=experiment.topology_id,
        status="CREATED",
        started_at=datetime.utcnow(),
        parameters={},
        logs=[],
    )
    runs[run_id] = run
    run_metrics.setdefault(run_id, [])
    return run


@app.get("/experiments/{experiment_id}/runs", response_model=List[ExperimentRun])
async def list_runs_for_experiment(experiment_id: str) -> List[ExperimentRun]:
    return [run for run in runs.values() if run.experiment_id == experiment_id]


@app.get("/runs/{run_id}", response_model=ExperimentRun)
async def get_run(run_id: str) -> ExperimentRun:
    run = runs.get(run_id)
    if not run:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Run not found")
    return run


@app.get("/runs/{run_id}/metrics", response_model=List[MetricRecord])
async def get_run_metrics(run_id: str) -> List[MetricRecord]:
    if run_id not in runs:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Run not found")
    return run_metrics.get(run_id, [])


@app.get("/metrics/definitions", response_model=List[MetricDefinition])
async def list_metric_definitions() -> List[MetricDefinition]:
    return metric_definitions


@app.post("/metrics/query", response_model=List[MetricSample])
async def query_metrics(query: MetricQuery) -> List[MetricSample]:
    return _filter_samples(query)


@app.post("/flows", response_model=FlowRule, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_api_key)])
async def create_flow(flow: FlowRule) -> FlowRule:
    if flow.topology_id not in topologies:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Topology not found")
    flow_id = flow.id or _generate_id("flow")
    stored = FlowRule(**flow.model_dump(exclude={"id"}), id=flow_id)
    flows[flow_id] = stored
    return stored


@app.get("/flows", response_model=List[FlowRule])
async def list_flows(topology_id: str | None = None) -> List[FlowRule]:
    if topology_id:
        return [flow for flow in flows.values() if flow.topology_id == topology_id]
    return list(flows.values())


@app.delete("/flows/{flow_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_api_key)])
async def delete_flow(flow_id: str) -> Response:
    if flow_id not in flows:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Flow not found")
    flows.pop(flow_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.get("/stream/events")
async def stream_events() -> StreamingResponse:
    return StreamingResponse(_event_stream(), media_type="text/event-stream")


@app.get("/health")
async def health() -> Dict[str, str]:
    return {"status": "ok"}


@app.post("/metrics/samples", response_model=Dict[str, int], status_code=status.HTTP_201_CREATED)
async def ingest_samples(payload: MetricSample | List[MetricSample]) -> Dict[str, int]:
    samples: List[MetricSample]
    if isinstance(payload, list):
        samples = payload
    else:
        samples = [payload]
    _store_samples(samples)
    return {"stored": len(samples)}


@app.get("/metrics/latest", response_model=List[MetricSample])
async def latest_metrics(metric: str | None = None, node: str | None = None, layer: MetricLayer | None = None) -> List[MetricSample]:
    filtered = [s for s in metric_samples if (not metric or s.metric == metric) and (not node or s.node == node) and (not layer or s.layer == layer)]
    latest_by_key: Dict[str, MetricSample] = {}
    for sample in filtered:
        key = f"{sample.metric}:{sample.node}:{sample.layer}"
        current = latest_by_key.get(key)
        if not current or sample.timestamp > current.timestamp:
            latest_by_key[key] = sample
    return list(latest_by_key.values())


@app.get("/metrics/export")
async def export_metrics(layer: MetricLayer | None = None) -> Response:
    path = _raw_file_for_layer(layer or "network") if layer else None
    if path and path.exists():
        content = path.read_text(encoding="utf-8")
        return Response(content=content, media_type="text/plain")
    # Fallback to in-memory export
    lines = [_serialize_sample(s) for s in metric_samples if not layer or s.layer == layer]
    return Response(content="\n".join(lines), media_type="text/plain")


@app.post("/metrics/collect", response_model=Dict[str, int], dependencies=[Depends(require_api_key)])
async def collect_metrics(
    mode: str = "synthetic",
    run_id: str | None = None,
    experiment_id: str | None = None,
    topology_id: str | None = None,
    version: str | None = None,
) -> Dict[str, int]:
    labels = {k: v for k, v in {"run_id": run_id, "experiment_id": experiment_id, "topology_id": topology_id, "version": version}.items() if v is not None}
    topology = topologies.get(topology_id) if topology_id else next(iter(topologies.values()), None)
    use_real = mode == "real" or (real_collection_default and mode != "synthetic")
    samples = _collect_real(topology, labels) if use_real else _collect_synthetic_full(topology, labels)
    _store_samples(samples)
    if run_id:
        _append_run_log(run_id, "metrics_collected")
    return {"collected": len(samples), "mode": "real" if use_real else "synthetic"}
