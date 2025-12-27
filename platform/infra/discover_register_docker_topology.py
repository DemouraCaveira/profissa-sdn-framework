#!/usr/bin/env python3
"""Discover a Docker-based topology from JSON config and register via API."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import httpx

from platform.backend.plugins.docker_topology_adapter import build_topology_from_config

DEFAULT_API = "http://localhost:8000"
DEFAULT_CONFIG = Path(__file__).resolve().parent.parent / "config" / "topology_docker_lab.json"


def load_config(path: Path) -> dict:
    with path.open() as f:
        return json.load(f)


def main(config_path: Path = DEFAULT_CONFIG, api_base: str | None = None) -> None:
    config = load_config(config_path)
    api_base = api_base or config.get("api_base") or DEFAULT_API

    topo = build_topology_from_config(config)

    url = f"{api_base}/topologies"
    resp = httpx.post(url, json=topo.model_dump(), timeout=10)
    if resp.status_code in (200, 201):
        print("Topology registered", resp.json())
    elif resp.status_code == 409:
        print("Topology already exists; skipping")
    else:
        print("Failed", resp.status_code, resp.text)
        resp.raise_for_status()


if __name__ == "__main__":
    cfg_path = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_CONFIG
    base = sys.argv[2] if len(sys.argv) > 2 else None
    main(cfg_path, base)
