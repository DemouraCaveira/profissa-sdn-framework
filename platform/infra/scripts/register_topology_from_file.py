#!/usr/bin/env python3
"""Register a topology definition JSON into the API."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import httpx

DEFAULT_API = "http://localhost:8000"
DEFAULT_TOPOLOGY = Path(__file__).resolve().parents[1] / "config" / "topology_docker_lab.json"


def main(path: Path, api_base: str = DEFAULT_API) -> None:
    with path.open() as f:
        topo = json.load(f)

    resp = httpx.post(f"{api_base}/topologies", json=topo, timeout=10)
    if resp.status_code in (200, 201):
        print("Topology registered", resp.json())
    elif resp.status_code == 409:
        print("Topology already exists; skipping")
    else:
        print("Failed", resp.status_code, resp.text)
        resp.raise_for_status()


if __name__ == "__main__":
    topo_path = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_TOPOLOGY
    api = sys.argv[2] if len(sys.argv) > 2 else DEFAULT_API
    main(topo_path, api)
