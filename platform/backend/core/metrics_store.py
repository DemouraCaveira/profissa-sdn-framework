from __future__ import annotations

from typing import Dict, Iterable, List, Optional

from platform.backend import schemas

# In-memory stores; replace with DB/TSDB later
_metric_definitions: List[schemas.MetricDefinition] = [
    schemas.MetricDefinition(name="latency_ms", description="Round-trip time", unit="ms"),
    schemas.MetricDefinition(name="jitter_ms", description="Latency variation", unit="ms"),
    schemas.MetricDefinition(name="packet_loss_pct", description="Packet loss", unit="%"),
    schemas.MetricDefinition(name="throughput_mbps", description="Throughput", unit="Mbps"),
    schemas.MetricDefinition(name="bandwidth_mbps", description="Link bandwidth", unit="Mbps"),
    schemas.MetricDefinition(name="cpu_pct", description="CPU usage", unit="%"),
    schemas.MetricDefinition(name="memory_pct", description="Memory usage", unit="%"),
    schemas.MetricDefinition(name="flow_bytes", description="Flow bytes", unit="bytes"),
    schemas.MetricDefinition(name="flow_packets", description="Flow packets", unit="packets"),
]
_metric_records: List[schemas.MetricRecord] = []


def metric_definitions() -> List[schemas.MetricDefinition]:
    return list(_metric_definitions)


def set_metric_definitions(defs: Iterable[schemas.MetricDefinition]) -> None:
    global _metric_definitions
    _metric_definitions = list(defs)


def add_record(record: schemas.MetricRecord) -> None:
    _metric_records.append(record)


def add_value(
    *,
    run_id: str,
    metric_name: str,
    value: float,
    timestamp: str,
    labels: Optional[Dict[str, str]] = None,
) -> None:
    _metric_records.append(
        schemas.MetricRecord(
            run_id=run_id,
            metric_name=metric_name,
            value=value,
            timestamp=timestamp,
            labels=labels or {},
        )
    )


def records_for_run(run_id: str) -> List[schemas.MetricRecord]:
    return [m for m in _metric_records if m.run_id == run_id]


def query_records(run_id: str, metrics: Optional[List[str]] = None, labels: Optional[Dict[str, str]] = None) -> List[schemas.MetricRecord]:
    result = [m for m in _metric_records if m.run_id == run_id]
    if metrics:
        result = [m for m in result if m.metric_name in metrics]
    if labels:
        result = [m for m in result if all(m.labels.get(k) == v for k, v in labels.items())]
    return result


def clear_all() -> None:
    _metric_records.clear()
*** End Patch