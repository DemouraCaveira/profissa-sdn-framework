from __future__ import annotations

import json
import os
import random
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Sequence
from uuid import uuid4

from fastapi import Depends, FastAPI, Header, HTTPException, Response, status
from fastapi.middleware.cors import CORSMiddleware

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
allowed_origins = os.getenv("CORS_ALLOW_ORIGINS", "http://localhost:5173").split(",")
config_path = os.getenv("PLATFORM_CONFIG_PATH", "platform/experiments/platform_config.json")
raw_dir = Path("raw")
raw_dir.mkdir(parents=True, exist_ok=True)

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


def _collect_synthetic_full(topology: Topology | None) -> List[MetricSample]:
    if not topology:
        return []
    now = datetime.utcnow()
    samples: List[MetricSample] = []

    def _mk(metric: str, layer: MetricLayer, node: str, value: float, details: Dict | None = None, labels: Dict | None = None) -> MetricSample:
        return MetricSample(
            timestamp=now,
            node=node,
            layer=layer,
            metric=metric,
            value=value,
            details=details or {},
            labels=labels or {},
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
    seeded = _collect_synthetic_full(next(iter(topologies.values()), None))
    if seeded:
        metric_samples.extend(seeded)
        _write_samples_to_raw(seeded)


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
    metric_samples.extend(samples)
    _write_samples_to_raw(samples)
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
async def collect_metrics() -> Dict[str, int]:
    topology = next(iter(topologies.values()), None)
    samples = _collect_synthetic_full(topology)
    metric_samples.extend(samples)
    _write_samples_to_raw(samples)
    return {"collected": len(samples)}
