from __future__ import annotations

import asyncio
import json
import time
from pathlib import Path
from typing import Any, Dict

from platform.backend.core.registry import registry
from platform.backend.core.plugins import MetricCollector


class CsvCollector:
    def __init__(self, path: str = "raw/metrics.csv") -> None:
        self._name = "csv"
        self._path = Path(path)
        self._path.parent.mkdir(parents=True, exist_ok=True)

    def name(self) -> str:
        return self._name

    def supported_metrics(self) -> list[str]:
        return ["latency_ms", "packet_loss_pct", "throughput_mbps"]

    async def start(self, context: Dict[str, Any]) -> None:
        # Ensure file exists with header if needed
        if not self._path.exists():
            self._path.write_text("timestamp,metric,value,labels\n", encoding="utf-8")
        await asyncio.sleep(0)

    async def collect(self, context: Dict[str, Any]) -> Dict[str, Any]:
        # Placeholder sample metrics; replace with real measurements
        metrics = {
            "latency_ms": 0.0,
            "packet_loss_pct": 0.0,
            "throughput_mbps": 0.0,
        }
        labels = {
            "experiment_id": getattr(context.get("run"), "experiment_id", ""),
            "run_id": getattr(context.get("run"), "id", ""),
            "topology_id": getattr(context.get("run"), "topology_id", ""),
        }
        ts = context.get("timestamp") or time.time()
        with self._path.open("a", encoding="utf-8") as f:
            for metric, value in metrics.items():
                f.write(f"{ts},{metric},{value},{json.dumps(labels)}\n")
        return {"metrics": metrics}

    async def stop(self, context: Dict[str, Any]) -> None:
        await asyncio.sleep(0)


collector = CsvCollector()
registry.register_metric_collector(collector)
