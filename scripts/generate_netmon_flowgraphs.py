#!/usr/bin/env python3
from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any, Dict, List

ROOT = Path(__file__).resolve().parents[1]
FLOW_DIR = ROOT / "gr-netmon" / "grc" / "flowgraphs"
METRIC_DIR = FLOW_DIR / "metrics"
SPECIAL_DIR = FLOW_DIR / "special"
CATALOG_JSON = ROOT / "gr-netmon" / "python" / "netmon" / "metric_catalog.json"
PLATFORM_CONFIG = ROOT / "platform" / "experiments" / "platform_config.json"


def _safe_id(name: str) -> str:
    safe = re.sub(r"[^a-zA-Z0-9_]+", "_", name).strip("_")
    return safe.lower()


def _options_block(flow_id: str, title: str) -> str:
    return f"""options:
  parameters:
    author: jon
    catch_exceptions: 'True'
    category: '[GRC Hier Blocks]'
    cmake_opt: ''
    comment: ''
    copyright: ''
    description: ''
    gen_cmake: 'On'
    gen_linking: dynamic
    generate_options: qt_gui
    hier_block_src_path: '.:'
    id: {flow_id}
    max_nouts: '0'
    output_language: python
    placement: (0,0)
    qt_qss_theme: ''
    realtime_scheduling: ''
    run: 'True'
    run_command: '{{python}} -u {{filename}}'
    run_options: prompt
    sizing_mode: fixed
    thread_safe_setters: ''
    title: {title}
    window_size: (1000,1000)
  states:
    bus_sink: false
    bus_source: false
    bus_structure: null
    coordinate: [8, 8]
    rotation: 0
    state: enabled
"""


def _load_platform_defaults() -> Dict[str, Any]:
    if not PLATFORM_CONFIG.exists():
        return {}
    try:
        payload = json.loads(PLATFORM_CONFIG.read_text(encoding="utf-8"))
    except Exception:
        return {}

    nodes = payload.get("nodes") or []
    hosts = [n for n in nodes if n.get("role") == "host"]
    switches = [n for n in nodes if n.get("role") == "switch"]
    controllers = [n for n in nodes if n.get("role") == "controller"]
    host_a = hosts[0] if hosts else {}
    host_b = hosts[1] if len(hosts) > 1 else {}
    switch = switches[0] if switches else {}
    controller = controllers[0] if controllers else {}

    return {
        "host_a": host_a.get("container_name") or host_a.get("id") or "h1",
        "host_b": host_b.get("container_name") or host_b.get("id") or "h2",
        "host_a_ip": host_a.get("mgmt_ip") or "172.20.0.12",
        "host_b_ip": host_b.get("mgmt_ip") or "172.20.0.13",
        "switch": switch.get("container_name") or switch.get("id") or "s1",
        "controller": controller.get("container_name") or controller.get("id") or "c1",
    }


def _variable_block() -> str:
    return """- name: samp_rate
  id: variable
  parameters:
    comment: ''
    value: '32000'
  states:
    bus_sink: false
    bus_source: false
    bus_structure: null
    coordinate: [184, 12]
    rotation: 0
    state: enabled
"""


def _qt_time_sink_block(label: str, name: str = "qtgui_time_sink_x_0") -> str:
    return f"""- name: {name}
  id: qtgui_time_sink_x
  parameters:
    affinity: ''
    alias: ''
    alpha1: '1.0'
    alpha10: '1.0'
    alpha2: '1.0'
    alpha3: '1.0'
    alpha4: '1.0'
    alpha5: '1.0'
    alpha6: '1.0'
    alpha7: '1.0'
    alpha8: '1.0'
    alpha9: '1.0'
    autoscale: 'False'
    axislabels: 'True'
    color1: blue
    color10: dark blue
    color2: red
    color3: green
    color4: black
    color5: cyan
    color6: magenta
    color7: yellow
    color8: dark red
    color9: dark green
    comment: ''
    ctrlpanel: 'True'
    entags: 'True'
    grid: 'True'
    gui_hint: ''
    label1: '{label}'
    label10: Signal 10
    label2: Signal 2
    label3: Signal 3
    label4: Signal 4
    label5: Signal 5
    label6: Signal 6
    label7: Signal 7
    label8: Signal 8
    label9: Signal 9
    legend: 'True'
    marker1: '0'
    marker10: '-1'
    marker2: '1'
    marker3: '-1'
    marker4: '-1'
    marker5: '-1'
    marker6: '-1'
    marker7: '-1'
    marker8: '-1'
    marker9: '-1'
    name: '""'
    nconnections: '1'
    size: '30'
    srate: samp_rate
    stemplot: 'False'
    style1: '0'
    style10: '1'
    style2: '1'
    style3: '1'
    style4: '1'
    style5: '1'
    style6: '1'
    style7: '1'
    style8: '1'
    style9: '1'
    tr_chan: '0'
    tr_delay: '0'
    tr_level: '0.0'
    tr_mode: qtgui.TRIG_MODE_FREE
    tr_slope: qtgui.TRIG_SLOPE_POS
    tr_tag: '""'
    type: float
    update_time: '0.1'
    width1: '1'
    width10: '1'
    width2: '1'
    width3: '1'
    width4: '1'
    width5: '1'
    width6: '1'
    width7: '1'
    width8: '1'
    width9: '1'
    ylabel: Amplitude
    ymax: '1'
    ymin: '0'
    yunit: '""'
  states:
    bus_sink: false
    bus_source: false
    bus_structure: null
    coordinate: [448, 204.0]
    rotation: 0
    state: true
"""


def _throttle_block(name: str = "blocks_throttle_0") -> str:
        return f"""- name: {name}
    id: blocks_throttle
    parameters:
        affinity: ''
        alias: ''
        comment: ''
        maxoutbuf: '0'
        minoutbuf: '0'
        samples_per_second: samp_rate
        vlen: '1'
    states:
        bus_sink: false
        bus_source: false
        bus_structure: null
        coordinate: [312, 208.0]
        rotation: 0
        state: true
"""


def _metric_block(metric_id: str, name: str, params: Dict[str, str]) -> str:
    params_yaml = "\n".join([f"    {k}: {v}" for k, v in params.items()])
    return f"""- name: {name}
  id: {metric_id}
  parameters:
{params_yaml}
  states:
    bus_sink: false
    bus_source: false
    bus_structure: null
    coordinate: [176, 208.0]
    rotation: 0
    state: true
"""


def _message_strobe_block(msg: str = "pmt.PMT_NIL", period_ms: int = 1000) -> str:
        lines = [
                "- name: blocks_message_strobe_0",
                "  id: blocks_message_strobe",
                "  parameters:",
                f"    msg: {msg}",
                f"    period: '{period_ms}'",
                "  states:",
                "    bus_sink: false",
                "    bus_source: false",
                "    bus_structure: null",
                "    coordinate: [176, 120.0]",
                "    rotation: 0",
                "    state: true",
        ]
        return "\n".join(lines) + "\n"


def _message_debug_block() -> str:
    return """- name: blocks_message_debug_0
  id: blocks_message_debug
  parameters:
    affinity: ''
    alias: ''
    color: '""'
    debug: 'True'
    label: ''
    maxoutbuf: '0'
    minoutbuf: '0'
    show: 'True'
    stream: 'False'
  states:
    bus_sink: false
    bus_source: false
    bus_structure: null
    coordinate: [448, 120.0]
    rotation: 0
    state: true
"""


def _connections(items: List[List[str]]) -> str:
    lines = ["connections:"]
    for item in items:
        lines.append(f"- [{', '.join(item)}]")
    return "\n".join(lines) + "\n"


def _flowgraph_auto(metric_name: str, metric_id: str, defaults: Dict[str, Any]) -> str:
    flow_id = f"metric_{_safe_id(metric_name)}_auto"
    title = f"Metric {metric_name} (auto)"
    params = {
        "node": defaults.get("host_a", "h1"),
        "value": "0.0",
        "interval": "1.0",
        "jitter": "0.0",
        "labels_json": "'{}'",
        "details_json": "'{}'",
    }
    blocks = "\n".join([
        "blocks:",
        _variable_block().rstrip(),
        _message_strobe_block().rstrip(),
        _metric_block(metric_id, f"{metric_id}_0", params).rstrip(),
        _throttle_block().rstrip(),
        _qt_time_sink_block(metric_name).rstrip(),
        _message_debug_block().rstrip(),
    ])
    conns = _connections([
        ["blocks_message_strobe_0", "'strobe'", f"{metric_id}_0", "'tick'"],
        [f"{metric_id}_0", "'out'", "blocks_throttle_0", "'0'"],
        ["blocks_throttle_0", "'0'", "qtgui_time_sink_x_0", "'0'"],
        [f"{metric_id}_0", "'metrics'", "blocks_message_debug_0", "'print'"],
    ])
    return _options_block(flow_id, title) + "\n" + blocks + "\n\n" + conns + "\nmetadata:\n  file_format: 1\n"


def _flowgraph_msg(metric_name: str, metric_id: str, defaults: Dict[str, Any]) -> str:
    flow_id = f"metric_{_safe_id(metric_name)}_msg"
    title = f"Metric {metric_name} (msg)"
    params = {
        "node": defaults.get("host_a", "h1"),
        "value": "0.0",
        "labels_json": "'{}'",
        "details_json": "'{}'",
    }
    blocks = "\n".join([
        "blocks:",
        _message_strobe_block().rstrip(),
        _metric_block(metric_id, f"{metric_id}_0", params).rstrip(),
        _message_debug_block().rstrip(),
    ])
    conns = _connections([
        ["blocks_message_strobe_0", "'strobe'", f"{metric_id}_0", "'tick'"],
        [f"{metric_id}_0", "'metrics'", "blocks_message_debug_0", "'print'"],
    ])
    return _options_block(flow_id, title) + "\n" + blocks + "\n\n" + conns + "\nmetadata:\n  file_format: 1\n"


def _host_ping_auto(defaults: Dict[str, Any]) -> str:
    flow_id = "host_ping_auto"
    title = "Host Ping (auto)"
    params = {
        "container_name": defaults.get("host_a", "h1"),
        "target_ip": defaults.get("host_b_ip", "172.20.0.13"),
        "interval": "1.0",
        "timeout": "2.0",
        "log_to_file": "true",
        "log_dir": "./raw",
    }
    blocks = "\n".join([
        "blocks:",
        _variable_block().rstrip(),
        _message_strobe_block().rstrip(),
        _metric_block("netmon_host_ping_auto", "netmon_host_ping_auto_0", params).rstrip(),
        _throttle_block().rstrip(),
        _qt_time_sink_block("host_ping_latency").rstrip(),
        _message_debug_block().rstrip(),
    ])
    conns = _connections([
        ["blocks_message_strobe_0", "'strobe'", "netmon_host_ping_auto_0", "'tick'"],
        ["netmon_host_ping_auto_0", "'out'", "blocks_throttle_0", "'0'"],
        ["blocks_throttle_0", "'0'", "qtgui_time_sink_x_0", "'0'"],
        ["netmon_host_ping_auto_0", "'metrics'", "blocks_message_debug_0", "'print'"],
    ])
    return _options_block(flow_id, title) + "\n" + blocks + "\n\n" + conns + "\nmetadata:\n  file_format: 1\n"


def _host_ping_msg(defaults: Dict[str, Any]) -> str:
    flow_id = "host_ping_msg"
    title = "Host Ping (msg)"
    params = {
        "container_name": defaults.get("host_a", "h1"),
        "target_ip": defaults.get("host_b_ip", "172.20.0.13"),
        "timeout": "2.0",
    }
    blocks = "\n".join([
        "blocks:",
        _message_strobe_block("{}").rstrip(),
        _metric_block("netmon_host_ping_msg", "netmon_host_ping_msg_0", params).rstrip(),
        _message_debug_block().rstrip(),
    ])
    conns = _connections([
        ["blocks_message_strobe_0", "'strobe'", "netmon_host_ping_msg_0", "'tick'"],
        ["netmon_host_ping_msg_0", "'out'", "blocks_message_debug_0", "'print'"],
    ])
    return _options_block(flow_id, title) + "\n" + blocks + "\n\n" + conns + "\nmetadata:\n  file_format: 1\n"


def main() -> None:
    METRIC_DIR.mkdir(parents=True, exist_ok=True)
    SPECIAL_DIR.mkdir(parents=True, exist_ok=True)

    metrics: List[Dict[str, Any]] = json.loads(CATALOG_JSON.read_text(encoding="utf-8"))
    defaults = _load_platform_defaults()

    for item in metrics:
        name = item["name"]
        safe = _safe_id(name)
        auto_id = f"netmon_metric_{safe}_auto"
        msg_id = f"netmon_metric_{safe}_msg"

        (METRIC_DIR / f"{safe}_auto.grc").write_text(_flowgraph_auto(name, auto_id, defaults), encoding="utf-8")
        (METRIC_DIR / f"{safe}_msg.grc").write_text(_flowgraph_msg(name, msg_id, defaults), encoding="utf-8")

    (SPECIAL_DIR / "host_ping_auto.grc").write_text(_host_ping_auto(defaults), encoding="utf-8")
    (SPECIAL_DIR / "host_ping_msg.grc").write_text(_host_ping_msg(defaults), encoding="utf-8")

    print(f"Generated {len(metrics) * 2} metric flowgraphs")


if __name__ == "__main__":
    main()
