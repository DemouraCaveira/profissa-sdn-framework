from __future__ import annotations

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, HTTPException

from backend import schemas
from backend.core.orchestrator import ExperimentOrchestrator
from backend.core.registry import registry

router = APIRouter(prefix="/experiments", tags=["experiments"])

_experiments: dict[str, schemas.Experiment] = {}
_runs: dict[str, schemas.Run] = {}
_orchestrator = ExperimentOrchestrator(registry, _experiments, _runs)


@router.post("", response_model=schemas.Experiment)
def create_experiment(payload: schemas.Experiment) -> schemas.Experiment:
    if payload.id in _experiments:
        raise HTTPException(status_code=409, detail="experiment already exists")
    _experiments[payload.id] = payload
    return payload


@router.get("", response_model=list[schemas.Experiment])
def list_experiments() -> list[schemas.Experiment]:
    return list(_experiments.values())


@router.get("/{experiment_id}", response_model=schemas.Experiment)
def get_experiment(experiment_id: str) -> schemas.Experiment:
    exp = _experiments.get(experiment_id)
    if not exp:
        raise HTTPException(status_code=404, detail="experiment not found")
    return exp


@router.put("/{experiment_id}", response_model=schemas.Experiment)
def update_experiment(experiment_id: str, payload: schemas.Experiment) -> schemas.Experiment:
    if experiment_id not in _experiments:
        raise HTTPException(status_code=404, detail="experiment not found")
    if payload.id != experiment_id:
        raise HTTPException(status_code=400, detail="payload id mismatch")
    _experiments[experiment_id] = payload
    return payload


@router.delete("/{experiment_id}")
def delete_experiment(experiment_id: str) -> dict[str, str]:
    if experiment_id not in _experiments:
        raise HTTPException(status_code=404, detail="experiment not found")
    del _experiments[experiment_id]
    return {"status": "deleted"}


@router.post("/{experiment_id}/run", response_model=schemas.Run)
async def start_run(experiment_id: str, schedule_at: Optional[str] = None) -> schemas.Run:
    target: Optional[datetime] = None
    if schedule_at:
        try:
            target = datetime.fromisoformat(schedule_at.replace("Z", ""))
        except ValueError:
            raise HTTPException(status_code=400, detail="invalid schedule_at (use ISO 8601)")

    try:
        run = await _orchestrator.schedule_run(experiment_id, target)
    except KeyError:
        raise HTTPException(status_code=404, detail="experiment not found")
    return run


@router.get("/{experiment_id}/runs", response_model=list[schemas.Run])
def list_runs_for_experiment(experiment_id: str) -> list[schemas.Run]:
    if experiment_id not in _experiments:
        raise HTTPException(status_code=404, detail="experiment not found")
    return [r for r in _runs.values() if r.experiment_id == experiment_id]


@router.get("/runs/{run_id}", response_model=schemas.Run)
def get_run(run_id: str) -> schemas.Run:
    run = _runs.get(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="run not found")
    return run
