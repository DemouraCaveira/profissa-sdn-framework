#!/usr/bin/env python3
from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any, Dict, List

from platform.backend.core.metric_catalog import METRIC_CATALOG

ROOT = Path(__file__).resolve().parents[1]
BLOCKS_DIR = ROOT / "gr-netmon" / "grc" / "blocks"
CATALOG_JSON = ROOT / "gr-netmon" / "python" / "netmon" / "metric_catalog.json"


def _safe_id(name: str) -> str:
    safe = re.sub(r"[^a-zA-Z0-9_]+", "_", name).strip("_")
    return safe.lower()


def _cat_layer(layer: str | None) -> str:
    return layer or "network"


def _metric_to_dict(item) -> Dict[str, Any]:
    return {
        "name": item.name,
        "description": item.description,
        "unit": item.unit,
        "layer": item.layer,
        "kind": item.kind,
        "category": item.category,
        "tags": item.tags,
        "dimensions": item.dimensions,
    }


def _write_block(path: Path, content: str) -> None:
    path.write_text(content, encoding="utf-8")


def main() -> None:
    BLOCKS_DIR.mkdir(parents=True, exist_ok=True)

    metrics: List[Dict[str, Any]] = [_metric_to_dict(m) for m in METRIC_CATALOG]
    CATALOG_JSON.write_text(json.dumps(metrics, indent=2, ensure_ascii=False), encoding="utf-8")

    auto_tpl = """id: {block_id}
label: Metric {metric_name} (auto)
category: 'Network/Metrics/{layer}'
flags: [python]
file_format: 1
documentation: '{description}'

parameters:
  - id: node
    label: Node
    dtype: string
    default: node
  - id: value
    label: Value
    dtype: real
    default: 0.0
  - id: interval
    label: Interval (s)
    dtype: real
    default: 1.0
  - id: jitter
    label: Jitter (+/-)
    dtype: real
    default: 0.0
  - id: labels_json
    label: Labels JSON
    dtype: string
    default: '{{}}'
  - id: details_json
    label: Details JSON
    dtype: string
    default: '{{}}'

inputs:
  - domain: message
    id: tick
    label: tick

outputs:
  - domain: stream
    id: out
    label: value
    dtype: float
    vlen: 1
  - domain: message
    id: metrics
    label: metrics

templates:
  imports: |
    from netmon.metric_emitter import MetricEmitterAuto
  make: |
    MetricEmitterAuto(metric_name='{metric_name}', layer='{layer}', unit='{unit}', node=${{node}}, value=${{value}}, interval=${{interval}}, jitter=${{jitter}}, labels_json=${{labels_json}}, details_json=${{details_json}})

ports:
  msg_in:
    - tick
  msg_out:
    - metrics
"""

    msg_tpl = """id: {block_id}
label: Metric {metric_name} (msg)
category: 'Network/Metrics/{layer}'
flags: [python]
file_format: 1
documentation: '{description}'

parameters:
  - id: node
    label: Node
    dtype: string
    default: node
  - id: value
    label: Default value
    dtype: real
    default: 0.0
  - id: labels_json
    label: Labels JSON
    dtype: string
    default: '{{}}'
  - id: details_json
    label: Details JSON
    dtype: string
    default: '{{}}'

inputs:
  - domain: message
    id: tick
    label: tick

outputs:
  - domain: message
    id: metrics
    label: metrics

templates:
  imports: |
    from netmon.metric_emitter import MetricEmitterMsg
  make: |
    MetricEmitterMsg(metric_name='{metric_name}', layer='{layer}', unit='{unit}', node=${{node}}, value=${{value}}, labels_json=${{labels_json}}, details_json=${{details_json}})

ports:
  msg_in:
    - tick
  msg_out:
    - metrics
"""

    for item in metrics:
        metric_name = item["name"]
        safe = _safe_id(metric_name)
        layer = _cat_layer(item.get("layer"))
        description = (item.get("description") or "").replace("'", "\"")
        unit = item.get("unit") or ""

        auto_id = f"netmon_metric_{safe}_auto"
        msg_id = f"netmon_metric_{safe}_msg"

        _write_block(
            BLOCKS_DIR / f"{auto_id}.block.yml",
            auto_tpl.format(
                block_id=auto_id,
                metric_name=metric_name,
                layer=layer,
                description=description,
                unit=unit,
            ),
        )
        _write_block(
            BLOCKS_DIR / f"{msg_id}.block.yml",
            msg_tpl.format(
                block_id=msg_id,
                metric_name=metric_name,
                layer=layer,
                description=description,
                unit=unit,
            ),
        )

    print(f"Generated {len(metrics)} metrics -> {len(metrics)*2} blocks")


if __name__ == "__main__":
    main()
