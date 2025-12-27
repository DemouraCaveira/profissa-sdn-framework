from __future__ import annotations

from typing import Any, Dict, List, Optional

import docker

from backend import schemas


def _container_ip(container) -> Optional[str]:
    try:
        nets = container.attrs.get("NetworkSettings", {}).get("Networks", {})
        for net in nets.values():
            ip = net.get("IPAddress")
            if ip:
                return ip
    except Exception:
        return None
    return None


def _node_from_container(
    client: docker.DockerClient,
    name: str,
    node_type: str,
    overrides: Dict[str, Any],
):
    mgmt_ip = overrides.get("mgmt_ip")
    image = overrides.get("image")
    meta = overrides.get("meta") or {}

    try:
        container = client.containers.get(name)
        mgmt_ip = mgmt_ip or _container_ip(container)
        image = image or container.attrs.get("Config", {}).get("Image")
    except Exception:
        if mgmt_ip is None and image is None and not meta:
            return None

    return schemas.TopologyNode(
        id=name,
        type=node_type,  # type: ignore[arg-type]
        mgmt_ip=mgmt_ip,
        image=image,
        meta=meta,
    )


def build_topology_from_config(config: Dict[str, Any]) -> schemas.Topology:
    hosts = config.get("hosts") or []
    switches = config.get("switches") or []
    controller_name = config.get("controller_name", "c1")
    topology_id = config.get("topology_id", "lab-docker-auto")
    name = config.get("name", "Docker lab auto-discovered")
    controller = config.get("controller", "ryu")
    link_defaults = config.get("link_defaults") or {}
    host_overrides = config.get("host_overrides") or {}
    switch_overrides = config.get("switch_overrides") or {}
    controller_meta = config.get("controller_meta") or {}
    meta = config.get("meta") or {"source": "docker"}

    client = docker.from_env()

    nodes: List[schemas.TopologyNode] = []
    links: List[schemas.TopologyLink] = []
    added_hosts: List[str] = []

    controller_node = _node_from_container(
        client,
        controller_name,
        "controller",
        {"meta": controller_meta},
    )
    if controller_node:
        nodes.append(controller_node)

    for h in hosts:
        override = host_overrides.get(h, {})
        host_node = _node_from_container(client, h, "host", override)
        if host_node:
            nodes.append(host_node)
            added_hosts.append(h)

    added_switches: List[str] = []
    for s in switches:
        override = switch_overrides.get(s, {})
        switch_node = _node_from_container(client, s, "switch", override)
        if switch_node:
            nodes.append(switch_node)
            added_switches.append(s)

    if added_switches:
        core = added_switches[0]
        for h in added_hosts:
            links.append(
                schemas.TopologyLink(
                    source=h,
                    target=core,
                    bandwidth_mbps=link_defaults.get("bandwidth_mbps"),
                    delay_ms=link_defaults.get("delay_ms"),
                    loss_pct=link_defaults.get("loss_pct"),
                )
            )

    topo = schemas.Topology(
        id=topology_id,
        name=name,
        controller=controller,
        nodes=nodes,
        links=links,
        meta=meta,
    )
    return topo


def build_topology(
    topology_id: str = "lab-docker-auto",
    name: str = "Docker lab auto-discovered",
    controller: str = "ryu",
    hosts: List[str] = None,
    switches: List[str] = None,
    controller_name: str = "c1",
) -> schemas.Topology:
    config = {
        "topology_id": topology_id,
        "name": name,
        "controller": controller,
        "hosts": hosts or [],
        "switches": switches or [],
        "controller_name": controller_name,
        "meta": {"source": "docker"},
        "link_defaults": {
            "bandwidth_mbps": 1000,
            "delay_ms": 1,
            "loss_pct": 0.0,
        },
    }
    return build_topology_from_config(config)
