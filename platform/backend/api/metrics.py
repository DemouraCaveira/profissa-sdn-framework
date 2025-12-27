from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel

from platform.backend import schemas
from platform.backend.core import metrics_store

router = APIRouter(prefix="/metrics", tags=["metrics"])


@router.get("/definitions", response_model=list[schemas.MetricDefinition])
def list_definitions() -> list[schemas.MetricDefinition]:
    return metrics_store.metric_definitions()


@router.get("/runs/{run_id}", response_model=list[schemas.MetricRecord])
def get_metrics_for_run(run_id: str) -> list[schemas.MetricRecord]:
    return metrics_store.records_for_run(run_id)


class MetricsQuery(BaseModel):
    run_id: str
    metrics: list[str] | None = None
    labels: dict[str, str] | None = None


@router.post("/query", response_model=list[schemas.MetricRecord])
def query_metrics(payload: MetricsQuery) -> list[schemas.MetricRecord]:
    return metrics_store.query_records(payload.run_id, payload.metrics, payload.labels or None)


@router.post("/runs/{run_id}", response_model=schemas.MetricRecord)
def ingest_metric(run_id: str, record: schemas.MetricRecord) -> schemas.MetricRecord:
    if record.run_id != run_id:
        from fastapi import HTTPException

        raise HTTPException(status_code=400, detail="run_id mismatch")
    metrics_store.add_record(record)
    return record
```