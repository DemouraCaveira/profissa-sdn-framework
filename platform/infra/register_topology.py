#!/usr/bin/env python3
"""Register a sample topology (h1, h2, s1, c1) into the API."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import httpx

DEFAULT_API = "http://localhost:8000"
TOPOLOGY_PATH = Path(__file__).parent / "topology_h1_h2_s1_c1.json"


def main(api_base: str = DEFAULT_API) -> None:
    data = json.loads(TOPOLOGY_PATH.read_text())
    url = f"{api_base}/topologies"
    resp = httpx.post(url, json=data, timeout=10)
    if resp.status_code in (200, 201):
        print("Topology registered", resp.json())
    elif resp.status_code == 409:
        print("Topology already exists; skipping")
    else:
        print("Failed", resp.status_code, resp.text)
        resp.raise_for_status()


if __name__ == "__main__":
    base = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_API
    main(base)
