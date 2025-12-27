from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.api import experiments, flows, metrics, topologies
from backend.plugins import csv_collector, mininet_runner, ping_generator  # noqa: F401

app = FastAPI(title="profissa-sdn-framework API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(topologies.router)
app.include_router(experiments.router)
app.include_router(metrics.router)
app.include_router(flows.router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
