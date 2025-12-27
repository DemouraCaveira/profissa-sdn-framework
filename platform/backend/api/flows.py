from __future__ import annotations

from fastapi import APIRouter, HTTPException

from platform.backend import schemas

router = APIRouter(prefix="/flows", tags=["flows"])

_flows: dict[str, schemas.Flow] = {}


@router.post("", response_model=schemas.FlowInstallResponse)
def install_flow(payload: schemas.Flow) -> schemas.FlowInstallResponse:
    if payload.id in _flows:
        raise HTTPException(status_code=409, detail="flow already exists")
    _flows[payload.id] = payload
    return schemas.FlowInstallResponse(id=payload.id, ok=True, message="installed")


@router.get("", response_model=list[schemas.Flow])
def list_flows() -> list[schemas.Flow]:
    return list(_flows.values())


@router.delete("/{flow_id}", response_model=schemas.FlowInstallResponse)
def delete_flow(flow_id: str) -> schemas.FlowInstallResponse:
    if flow_id not in _flows:
        raise HTTPException(status_code=404, detail="flow not found")
    del _flows[flow_id]
    return schemas.FlowInstallResponse(id=flow_id, ok=True, message="removed")
