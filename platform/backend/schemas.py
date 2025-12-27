from __future__ import annotations

from enum import Enum
from typing import Dict, List, Literal, Optional

from pydantic import BaseModel, Field


class TopologyNode(BaseModel):
    id: str
    type: Literal["host", "switch", "controller"]
    mgmt_ip: Optional[str] = None
    image: Optional[str] = None
    meta: Dict[str, str] = Field(default_factory=dict)


class TopologyLink(BaseModel):
    source: str
    target: str
    bandwidth_mbps: Optional[float] = None
    delay_ms: Optional[float] = None
    loss_pct: Optional[float] = None
    meta: Dict[str, str] = Field(default_factory=dict)


class Topology(BaseModel):
    id: str
    name: str
    controller: Optional[str] = None
    nodes: List[TopologyNode]
    links: List[TopologyLink]
    meta: Dict[str, str] = Field(default_factory=dict)


class TrafficPattern(BaseModel):
    generator: Literal["iperf", "ping", "custom"]
    src: str
    dst: str
    protocol: Literal["tcp", "udp", "icmp"]
    rate: Optional[str] = None  # e.g., "100Mbps"
    duration_sec: int = 30
    params: Dict[str, str] = Field(default_factory=dict)


class MetricsSet(BaseModel):
    metrics: List[str]
    interval_sec: float = 5.0
    labels: List[str] = Field(default_factory=lambda: ["experiment_id", "run_id", "topology_id"])


class Experiment(BaseModel):
    id: str
    topology_id: str
    name: str
    description: Optional[str] = None
    hypotheses: Optional[str] = None
    traffic: List[TrafficPattern]
    metrics: MetricsSet
    duration_sec: int
    tags: List[str] = Field(default_factory=list)
    template_version: Optional[str] = None


class ExperimentTemplate(BaseModel):
    version: str
    topology: Topology
    experiments: List[Experiment]


class RunStatus(str, Enum):
    CREATED = "CREATED"
    SCHEDULED = "SCHEDULED"
    RUNNING = "RUNNING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"


class RunEventType(str, Enum):
    ENV_PREPARED = "ENV_PREPARED"
    CONTROLLER_INITIALIZED = "CONTROLLER_INITIALIZED"
    TOPOLOGY_INSTALLED = "TOPOLOGY_INSTALLED"
    FLOWS_APPLIED = "FLOWS_APPLIED"
    TRAFFIC_STARTED = "TRAFFIC_STARTED"
    METRICS_COLLECTION_STARTED = "METRICS_COLLECTION_STARTED"
    METRICS_COLLECTION_STOPPED = "METRICS_COLLECTION_STOPPED"
    TRAFFIC_STOPPED = "TRAFFIC_STOPPED"
    TEARDOWN_COMPLETED = "TEARDOWN_COMPLETED"
    RUN_COMPLETED = "RUN_COMPLETED"
    RUN_FAILED = "RUN_FAILED"
    RUN_CANCELLED = "RUN_CANCELLED"
    SCHEDULED = "SCHEDULED"


class RunEvent(BaseModel):
    type: RunEventType
    timestamp: str
    message: Optional[str] = None
    data: Dict[str, str] = Field(default_factory=dict)


class Run(BaseModel):
    id: str
    experiment_id: str
    topology_id: str
    status: RunStatus = RunStatus.CREATED
    started_at: Optional[str] = None
    finished_at: Optional[str] = None
    params: Dict[str, str] = Field(default_factory=dict)
    logs: List[str] = Field(default_factory=list)
    events: List[RunEvent] = Field(default_factory=list)


class MetricDefinition(BaseModel):
    name: str
    description: Optional[str] = None
    unit: Optional[str] = None


class MetricRecord(BaseModel):
    run_id: str
    metric_name: str
    value: float
    timestamp: str
    labels: Dict[str, str] = Field(default_factory=dict)


class Flow(BaseModel):
    id: str
    topology_id: str
    controller: Optional[str] = None
    priority: Optional[int] = None
    match: Dict[str, str] = Field(default_factory=dict)
    actions: Dict[str, str] = Field(default_factory=dict)


class FlowInstallResponse(BaseModel):
    id: str
    ok: bool
    message: Optional[str] = None
