from __future__ import annotations

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
