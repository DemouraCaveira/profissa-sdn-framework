#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import asyncio
import time
import os
import csv
import json
import socket
import statistics
import subprocess
import shlex
from datetime import datetime
from typing import Dict, List, Optional

# Optional imports
try:
    import docker
except Exception:
    docker = None

try:
    import psutil
except Exception:
    psutil = None

try:
    from prometheus_client import CollectorRegistry, Gauge, push_to_gateway
except Exception:
    CollectorRegistry = None
    Gauge = None
    push_to_gateway = None

# ---------------------------
# Configuration (edit as needed)
# ---------------------------
CONFIG = {
    "containers": ["s1", "c1", "h1", "h2"],
    "STATIC_HOSTS": {
        "s1": "172.17.0.2",
        "c1": "172.18.0.3",
        "h1": "172.18.0.2",
        "h2": "172.18.0.4",
    },
    "protocols": ["icmp", "tcp", "udp"],
    "ports": {
        "c1": {"tcp": 8080, "udp": 53},
        "h1": {"tcp": 22, "udp": 53},
        "h2": {"tcp": 22, "udp": 53},
        "s1": {"tcp": 22, "udp": 53},
    },
    "interval_sec": 5.0,
    "icmp_count": 3,
    "timeout_sec": 1.0,
    "controller_api": {
        "enabled": True,
        "name": "c1",
        "base_path": "/",
        "endpoints": [
            "stats/switches",
            "stats/flow/1",
            "stats/port/1",
        ]
    },
    "export_csv": "/home/jon/profissa-sdn-framework/raw/sdn_monitor.csv",
    "export_json": "/home/jon/profissa-sdn-framework/raw/sdn_monitor.jsonl",
    "prometheus_pushgateway": None,
    "job_name": "sdn_monitor",
}


# ---------------------------
# Utilities
# ---------------------------
def now_utc() -> str:
    return datetime.utcnow().isoformat() + "Z"

def safe_mean(values: List[float]) -> float:
    return statistics.mean(values) if values else float("nan")

def safe_stdev(values: List[float]) -> float:
    if values and len(values) > 1:
        return statistics.pstdev(values)
    return 0.0

def resolve_container_ips(names: List[str]) -> Dict[str, str]:
    ips = {}
    if docker is None:
        return ips
    try:
        client = docker.from_env()
        for name in names:
            try:
                c = client.containers.get(name)
                ip = None
                ns = c.attrs.get("NetworkSettings", {})
                if ns.get("IPAddress"):
                    ip = ns["IPAddress"]
                else:
                    for net in ns.get("Networks", {}).values():
                        ip = net.get("IPAddress")
                        if ip:
                            break
                if ip:
                    ips[name] = ip
            except Exception:
                # leave unresolved; fallback later
                pass
    except Exception:
        pass
    return ips

async def run_cmd(cmd: str, timeout: float) -> (int, str, str):
    try:
        proc = await asyncio.create_subprocess_exec(
            *shlex.split(cmd),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        try:
            outs, errs = await asyncio.wait_for(proc.communicate(), timeout=timeout + 5.0)
        except asyncio.TimeoutError:
            proc.kill()
            return -1, "", f"timeout running: {cmd}"
        return proc.returncode, outs.decode(), errs.decode()
    except Exception as e:
        return -1, "", str(e)

# ---------------------------
# Probes
# ---------------------------
async def probe_icmp(host: str, count: int, timeout: float) -> Dict:
    cmd = f"ping -c {count} -W {int(timeout)} {shlex.quote(host)}"
    code, out, err = await run_cmd(cmd, timeout=timeout * count + 1.0)
    rtts = []
    loss_pct = None
    for line in out.splitlines():
        if "time=" in line:
            try:
                ms_str = line.split("time=")[1].split(" ")[0]
                rtts.append(float(ms_str))
            except Exception:
                pass
        if "packet loss" in line:
            try:
                loss_pct = float(line.split('%')[0].split()[-1])
            except Exception:
                pass
    avg = safe_mean(rtts)
    jitter = safe_stdev(rtts)
    if loss_pct is None:
        # Infer loss from received lines
        received = len(rtts)
        loss_pct = 100.0 * (count - received) / max(count, 1)
    return {
        "ok": code == 0 or len(rtts) > 0,
        "avg_ms": avg,
        "jitter_ms": jitter,
        "loss_pct": loss_pct,
        "samples": rtts,
        "error": err.strip() if code != 0 and not rtts else ""
    }

async def probe_tcp(host: str, port: int, attempts: int, timeout: float) -> Dict:
    rtts = []
    success = 0
    for _ in range(attempts):
        t0 = time.monotonic()
        try:
            fut = asyncio.open_connection(host, port)
            reader, writer = await asyncio.wait_for(fut, timeout=timeout)
            writer.close()
            try:
                await writer.wait_closed()
            except Exception:
                pass
            success += 1
            rtts.append((time.monotonic() - t0) * 1000.0)
        except Exception:
            rtts.append(None)
    ok_rtts = [x for x in rtts if x is not None]
    return {
        "ok": success > 0,
        "avg_ms": safe_mean(ok_rtts),
        "jitter_ms": safe_stdev(ok_rtts),
        "success_rate_pct": 100.0 * success / max(attempts, 1),
    }

async def probe_udp(host: str, port: int, attempts: int, timeout: float) -> Dict:
    send_ms = []
    for _ in range(attempts):
        t0 = time.monotonic()
        try:
            loop = asyncio.get_event_loop()
            # send UDP in thread to avoid blocking
            def _send():
                with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
                    s.settimeout(timeout)
                    s.sendto(b"sdn_probe", (host, port))
            await loop.run_in_executor(None, _send)
            send_ms.append((time.monotonic() - t0) * 1000.0)
        except Exception:
            send_ms.append(None)
    ok = [x for x in send_ms if x is not None]
    return {
        "ok": len(ok) > 0,
        "avg_ms": safe_mean(ok),
        "jitter_ms": safe_stdev(ok),
    }

async def controller_status(ip: str, port: int, endpoints: List[str], timeout: float) -> Dict:
    import aiohttp  # lightweight client
    data = {}
    base = f"http://{ip}:{port}".rstrip("/")
    try:
        async with aiohttp.ClientSession() as session:
            for ep in endpoints:
                url = f"{base}/{ep.lstrip('/')}"
                try:
                    async with session.get(url, timeout=timeout) as resp:
                        txt = await resp.text()
                        try:
                            data[ep] = json.loads(txt)
                        except Exception:
                            data[ep] = {"text": txt, "status": resp.status}
                except Exception as e:
                    data[ep] = {"error": str(e)}
    except Exception as e:
        data = {"error": str(e)}
    return data

def system_metrics() -> Dict:
    if psutil is None:
        return {}
    try:
        net = psutil.net_io_counters(pernic=False)
        return {
            "cpu_pct": psutil.cpu_percent(interval=None),
            "mem_pct": psutil.virtual_memory().percent,
            "net_bytes_sent": net.bytes_sent,
            "net_bytes_recv": net.bytes_recv,
        }
    except Exception:
        return {}

# ---------------------------
# Exporters
# ---------------------------
class Exporter:
    def __init__(self, csv_path: Optional[str], jsonl_path: Optional[str], pgw: Optional[str], job_name: str):
        self.csv_path = csv_path
        self.jsonl_path = jsonl_path
        self.pgw = pgw
        self.job_name = job_name
        self.csv_writer = None
        self.csv_fp = None
        if csv_path:
            new_file = not os.path.exists(csv_path)
            self.csv_fp = open(csv_path, "a", newline="")
            self.csv_writer = csv.writer(self.csv_fp)
            if new_file:
                self.csv_writer.writerow([
                    "timestamp", "node", "layer", "metric", "value", "details_json"
                ])
        if self.pgw and Gauge and CollectorRegistry:
            self.registry = CollectorRegistry()
            self.g_latency = Gauge("sdn_latency_ms", "Latency by node/protocol", ["node", "protocol"], registry=self.registry)
            self.g_loss = Gauge("sdn_loss_pct", "Loss percent by node", ["node"], registry=self.registry)
            self.g_tcp_success = Gauge("sdn_tcp_success_pct", "TCP success rate", ["node"], registry=self.registry)
        else:
            self.registry = None

    def write_row(self, ts: str, node: str, layer: str, metric: str, value, details: Dict):
        if self.csv_writer:
            self.csv_writer.writerow([ts, node, layer, metric, value, json.dumps(details, ensure_ascii=False)])
            self.csv_fp.flush()
        if self.jsonl_path:
            with open(self.jsonl_path, "a") as f:
                f.write(json.dumps({
                    "timestamp": ts, "node": node, "layer": layer,
                    "metric": metric, "value": value, "details": details
                }, ensure_ascii=False) + "\n")

    def push_prometheus(self):
        if self.pgw and self.registry and push_to_gateway:
            try:
                push_to_gateway(self.pgw, job=self.job_name, registry=self.registry)
            except Exception:
                pass

# ---------------------------
# Main monitoring loop
# ---------------------------
async def monitor():
    ts = now_utc()
    # Resolve IPs via Docker, fallback to static
    names = CONFIG["containers"]
    ips = resolve_container_ips(names) if names else {}
    hosts = {}
    for name in CONFIG["STATIC_HOSTS"]:
        hosts[name] = ips.get(name, CONFIG["STATIC_HOSTS"][name])

    # Prepare exporter
    exp = Exporter(CONFIG.get("export_csv"), CONFIG.get("export_json"),
                   CONFIG.get("prometheus_pushgateway"), CONFIG.get("job_name"))

    interval = CONFIG["interval_sec"]
    count = CONFIG["icmp_count"]
    timeout = CONFIG["timeout_sec"]
    protocols = set(CONFIG["protocols"])

    # Controller setup
    ctrl_cfg = CONFIG["controller_api"]
    ctrl_enabled = ctrl_cfg.get("enabled", False)
    ctrl_name = ctrl_cfg.get("name")
    ctrl_endpoints = ctrl_cfg.get("endpoints", [])
    ctrl_port = CONFIG["ports"].get(ctrl_name, {}).get("tcp", 8080)

    print(f"[{ts}] SDN Monitor starting. Nodes: {hosts}")

    while True:
        ts = now_utc()

        # System metrics (host machine)
        sm = system_metrics()
        if sm:
            for k, v in sm.items():
                print(f"{ts} [system] {k}={v}")
                exp.write_row(ts, "system", "host", k, v, {})

        # Probes per node
        tasks = []
        for node, ip in hosts.items():
            node_ports = CONFIG["ports"].get(node, {})
            if "icmp" in protocols:
                tasks.append(("icmp", node, ip, probe_icmp(ip, count=count, timeout=timeout)))
            if "tcp" in protocols and node_ports.get("tcp"):
                tasks.append(("tcp", node, ip, probe_tcp(ip, node_ports["tcp"], attempts=3, timeout=timeout)))
            if "udp" in protocols and node_ports.get("udp"):
                tasks.append(("udp", node, ip, probe_udp(ip, node_ports["udp"], attempts=3, timeout=timeout)))

        # Controller API
        ctrl_task = None
        if ctrl_enabled and ctrl_name in hosts:
            ctrl_ip = hosts[ctrl_name]
            ctrl_task = controller_status(ctrl_ip, ctrl_port, ctrl_endpoints, timeout=timeout)

        # Run concurrently
        futs = [t[3] for t in tasks]
        if ctrl_task:
            futs.append(ctrl_task)
        results = await asyncio.gather(*futs, return_exceptions=True)

        # Process results
        idx = 0
        for proto, node, ip, _ in tasks:
            res = results[idx]; idx += 1
            if isinstance(res, Exception):
                print(f"{ts} [{node}] {proto} error: {res}")
                exp.write_row(ts, node, "dataplane", f"{proto}_error", "", {"error": str(res)})
                continue
            if proto == "icmp":
                print(f"{ts} [{node}] ICMP avg={res['avg_ms']:.2f}ms jitter={res['jitter_ms']:.2f}ms loss={res['loss_pct']:.1f}% ok={res['ok']}")
                exp.write_row(ts, node, "dataplane", "icmp_avg_ms", res["avg_ms"], res)
                exp.write_row(ts, node, "dataplane", "icmp_loss_pct", res["loss_pct"], res)
                if exp.registry:
                    exp.g_latency.labels(node=node, protocol="icmp").set(res["avg_ms"] if res["avg_ms"] == res["avg_ms"] else 0.0)
                    exp.g_loss.labels(node=node).set(res["loss_pct"])
            elif proto == "tcp":
                print(f"{ts} [{node}] TCP@{CONFIG['ports'][node]['tcp']} avgConn={res['avg_ms']:.2f}ms jitter={res['jitter_ms']:.2f}ms success={res['success_rate_pct']:.1f}%")
                exp.write_row(ts, node, "dataplane", "tcp_avg_ms", res["avg_ms"], res)
                exp.write_row(ts, node, "dataplane", "tcp_success_pct", res["success_rate_pct"], res)
                if exp.registry:
                    exp.g_latency.labels(node=node, protocol="tcp").set(res["avg_ms"] if res["avg_ms"] == res["avg_ms"] else 0.0)
                    exp.g_tcp_success.labels(node=node).set(res["success_rate_pct"])
            elif proto == "udp":
                print(f"{ts} [{node}] UDP@{CONFIG['ports'][node]['udp']} sendAvg={res['avg_ms']:.2f}ms jitter={res['jitter_ms']:.2f}ms")
                exp.write_row(ts, node, "dataplane", "udp_avg_ms", res["avg_ms"], res)

        # Controller results at the end
        if ctrl_task:
            res_ctrl = results[-1]
            if isinstance(res_ctrl, Exception):
                print(f"{ts} [controller] error: {res_ctrl}")
                exp.write_row(ts, ctrl_name, "control", "controller_error", "", {"error": str(res_ctrl)})
            else:
                print(f"{ts} [controller] endpoints={len(ctrl_endpoints)}")
                exp.write_row(ts, ctrl_name, "control", "controller_data", 1, res_ctrl)

        # Push metrics (Prometheus)
        exp.push_prometheus()

        await asyncio.sleep(interval)

# ---------------------------
# Entrypoint
# ---------------------------
if __name__ == "__main__":
    try:
        asyncio.run(monitor())
    except KeyboardInterrupt:
        print("Exiting.")
