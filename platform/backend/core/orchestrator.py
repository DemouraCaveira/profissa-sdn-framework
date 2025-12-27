from __future__ import annotations

import asyncio
from datetime import datetime
from typing import Dict, Optional
from uuid import uuid4

from platform.backend import schemas
from platform.backend.core import metrics_store
from platform.backend.core.registry import PluginRegistry


def _utc_ts() -> str:
    return datetime.utcnow().isoformat() + "Z"


class ExperimentOrchestrator:
    def __init__(
        self,
        registry: PluginRegistry,
        experiments_store: Dict[str, schemas.Experiment],
        runs_store: Dict[str, schemas.Run],
    ) -> None:
        self.registry = registry
        self.experiments_store = experiments_store
        self.runs_store = runs_store
        self._metric_tasks: Dict[str, asyncio.Task] = {}

    def _record_event(
        self,
        run: schemas.Run,
        event_type: schemas.RunEventType,
        message: str = "",
        data: Optional[Dict[str, str]] = None,
    ) -> None:
        run.events.append(
            schemas.RunEvent(
                type=event_type,
                timestamp=_utc_ts(),
                message=message or None,
                data=data or {},
            )
        )
        if message:
            run.logs.append(message)

    def _set_status(self, run: schemas.Run, status: schemas.RunStatus) -> None:
        run.status = status
        if status in (schemas.RunStatus.COMPLETED, schemas.RunStatus.FAILED, schemas.RunStatus.CANCELLED):
            run.finished_at = _utc_ts()

    async def schedule_run(self, experiment_id: str, schedule_at: Optional[datetime] = None) -> schemas.Run:
        exp = self.experiments_store.get(experiment_id)
        if not exp:
            raise KeyError("experiment not found")

        run_id = str(uuid4())
        run = schemas.Run(
            id=run_id,
            experiment_id=experiment_id,
            topology_id=exp.topology_id,
            status=schemas.RunStatus.SCHEDULED if schedule_at else schemas.RunStatus.CREATED,
            started_at=None,
            params={},
            logs=[],
            events=[],
        )
        self.runs_store[run_id] = run

        if schedule_at and schedule_at > datetime.utcnow():
            self._record_event(run, schemas.RunEventType.SCHEDULED, f"Scheduled for {schedule_at.isoformat()}Z")
            delay = (schedule_at - datetime.utcnow()).total_seconds()
            asyncio.create_task(self._delayed_execute(run_id, delay))
        else:
            self._record_event(run, schemas.RunEventType.SCHEDULED, "Immediate execution")
            asyncio.create_task(self._execute_run(run_id))

        return run

    async def _delayed_execute(self, run_id: str, delay: float) -> None:
        await asyncio.sleep(max(delay, 0))
        await self._execute_run(run_id)

    async def _execute_run(self, run_id: str) -> None:
        run = self.runs_store.get(run_id)
        if not run:
            return

        run.started_at = _utc_ts()
        self._set_status(run, schemas.RunStatus.RUNNING)

        try:
            exp = self.experiments_store[run.experiment_id]
            context: Dict[str, object] = {
                "run": run,
                "experiment": exp,
                "topology_id": exp.topology_id,
            }
            interval_sec = getattr(exp.metrics, "interval_sec", 5.0)
            context["metrics_interval_sec"] = interval_sec

            await self._prepare_environment(run, context)
            await self._init_controller(run, context)
            await self._install_topology(run, context)
            await self._run_experiment(run, context)
            await self._apply_flows(run, context)
            await self._start_traffic(run, context)
            await self._start_metrics(run, context, interval_sec)

            # Placeholder: simulate experiment duration
            await asyncio.sleep(0)

            await self._stop_traffic(run, context)
            await self._stop_metrics(run, context)
            await self._teardown_environment(run, context)

            self._record_event(run, schemas.RunEventType.RUN_COMPLETED, "Run finished")
            self._set_status(run, schemas.RunStatus.COMPLETED)
        except Exception as exc:  # pragma: no cover - placeholder orchestration failure path
            self._record_event(run, schemas.RunEventType.RUN_FAILED, str(exc))
            self._set_status(run, schemas.RunStatus.FAILED)

    async def _prepare_environment(self, run: schemas.Run, context: Dict[str, object]) -> None:
        runner = self._select_runner()
        if runner:
            await runner.setup(context)
        self._record_event(run, schemas.RunEventType.ENV_PREPARED, "Environment ready")

    async def _init_controller(self, run: schemas.Run, context: Dict[str, object]) -> None:
        self._record_event(run, schemas.RunEventType.CONTROLLER_INITIALIZED, "Controller initialized")

    async def _install_topology(self, run: schemas.Run, context: Dict[str, object]) -> None:
        runner = self._select_runner()
        if runner:
            await runner.run(context)
        self._record_event(run, schemas.RunEventType.TOPOLOGY_INSTALLED, "Topology installed")

    async def _run_experiment(self, run: schemas.Run, context: Dict[str, object]) -> None:
        # Placeholder hook for extended orchestration
        self._record_event(run, schemas.RunEventType.SCHEDULED, "Experiment execution hook invoked")

    async def _apply_flows(self, run: schemas.Run, context: Dict[str, object]) -> None:
        self._record_event(run, schemas.RunEventType.FLOWS_APPLIED, "Flows applied")

    async def _start_traffic(self, run: schemas.Run, context: Dict[str, object]) -> None:
        for name in self.registry.traffic_generators():
            gen = self.registry.get_traffic_generator(name)
            await gen.start(context)
        self._record_event(run, schemas.RunEventType.TRAFFIC_STARTED, "Traffic generators started")

    async def _stop_traffic(self, run: schemas.Run, context: Dict[str, object]) -> None:
        for name in self.registry.traffic_generators():
            gen = self.registry.get_traffic_generator(name)
            await gen.stop(context)
        self._record_event(run, schemas.RunEventType.TRAFFIC_STOPPED, "Traffic generators stopped")

    async def _start_metrics(self, run: schemas.Run, context: Dict[str, object]) -> None:
        for name in self.registry.metric_collectors():
            collector = self.registry.get_metric_collector(name)
            await collector.start(context)
        interval = context.get("metrics_interval_sec", 5.0)  # type: ignore[assignment]
        task = asyncio.create_task(self._collect_metrics(run, context, float(interval)))
        self._metric_tasks[run.id] = task
        self._record_event(run, schemas.RunEventType.METRICS_COLLECTION_STARTED, "Metrics collection started")

    async def _stop_metrics(self, run: schemas.Run, context: Dict[str, object]) -> None:
        task = self._metric_tasks.pop(run.id, None)
        if task:
            task.cancel()
        for name in self.registry.metric_collectors():
            collector = self.registry.get_metric_collector(name)
            await collector.stop(context)
        self._record_event(run, schemas.RunEventType.METRICS_COLLECTION_STOPPED, "Metrics collection stopped")

    async def _teardown_environment(self, run: schemas.Run, context: Dict[str, object]) -> None:
        runner = self._select_runner()
        if runner:
            await runner.teardown(context)
        self._record_event(run, schemas.RunEventType.TEARDOWN_COMPLETED, "Environment teardown complete")

    def _select_runner(self):
        names = self.registry.runners()
        if not names:
            return None
        return self.registry.get_runner(names[0])

    async def _collect_metrics(self, run: schemas.Run, context: Dict[str, object], interval: float) -> None:
        labels = {
            "experiment_id": run.experiment_id,
            "topology_id": run.topology_id,
            "run_id": run.id,
        }
        try:
            while run.status == schemas.RunStatus.RUNNING:
                ts = _utc_ts()
                for name in self.registry.metric_collectors():
                    collector = self.registry.get_metric_collector(name)
                    payload = await collector.collect(context)
                    if not payload:
                        continue
                    metrics_map = payload.get("metrics") if isinstance(payload, dict) else None
                    if metrics_map is None and isinstance(payload, dict):
                        metrics_map = {k: v for k, v in payload.items() if isinstance(v, (int, float))}
                    if not metrics_map:
                        continue
                    for metric_name, value in metrics_map.items():
                        try:
                            metrics_store.add_value(
                                run_id=run.id,
                                metric_name=str(metric_name),
                                value=float(value),
                                timestamp=ts,
                                labels=labels,
                            )
                        except Exception:
                            continue
                await asyncio.sleep(max(interval, 0.1))
        except asyncio.CancelledError:
            return
