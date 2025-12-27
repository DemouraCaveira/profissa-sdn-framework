from __future__ import annotations

from fastapi import APIRouter, HTTPException

from platform.backend import schemas

router = APIRouter(prefix="/topologies", tags=["topologies"])

# Simple in-memory store
_topologies: dict[str, schemas.Topology] = {}


@router.post("", response_model=schemas.Topology)
def create_topology(payload: schemas.Topology) -> schemas.Topology:
    if payload.id in _topologies:
        raise HTTPException(status_code=409, detail="topology already exists")
    _topologies[payload.id] = payload
    return payload


@router.get("", response_model=list[schemas.Topology])
def list_topologies() -> list[schemas.Topology]:
    return list(_topologies.values())


@router.get("/{topology_id}", response_model=schemas.Topology)
def get_topology(topology_id: str) -> schemas.Topology:
    topo = _topologies.get(topology_id)
    if not topo:
        raise HTTPException(status_code=404, detail="topology not found")
    return topo


@router.put("/{topology_id}", response_model=schemas.Topology)
def update_topology(topology_id: str, payload: schemas.Topology) -> schemas.Topology:
    if topology_id not in _topologies:
        raise HTTPException(status_code=404, detail="topology not found")
    if payload.id != topology_id:
        raise HTTPException(status_code=400, detail="payload id mismatch")
    _topologies[topology_id] = payload
    return payload


@router.delete("/{topology_id}")
def delete_topology(topology_id: str) -> dict[str, str]:
    if topology_id not in _topologies:
        raise HTTPException(status_code=404, detail="topology not found")
    del _topologies[topology_id]
    return {"status": "deleted"}
