"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactFlow, {
  addEdge,
  Background,
  Controls,
  ReactFlowProvider,
  type Connection,
  type Edge,
  type Node,
  type OnConnect,
} from "reactflow";
import "reactflow/dist/style.css";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { nodeTypes } from "@/features/topology/nodeTypes";
import { edgeTypes, type LinkStatus } from "@/features/topology/edgeTypes";
import { cn } from "@/lib/cn";

type NodeKind = "switch" | "host" | "controller";
type MapMode = "logical" | "physical";

type SwitchPort = { portNo: number; name: string; rxPkts: number; txPkts: number; errors: number };
type FlowRow = { table: number; priority: number; match: string; actions: string; packets: number; bytes: number };

type HostArpRow = { ip: string; mac: string; iface: string; state: "REACHABLE" | "STALE" | "FAILED" };
type HostSocketRow = { proto: "tcp" | "udp"; local: string; remote: string; state: string; pid: number; proc: string };
type IfaceStats = { iface: string; rxMbps: number; txMbps: number; rxDrops: number; txDrops: number; errors: number };

type TopologyNodeData = {
  id: string;
  dpid?: string;
  mgmtIp?: string;
  ip?: string;
  mac?: string;
  iface?: string;
  gateway?: string;

  // Controller-only
  status?: "online" | "offline";
  responseLatencyMs?: number;

  // Switch-only technical fields
  ports?: SwitchPort[];
  flowTables?: FlowRow[];
  pktStats?: { rxPps: number; txPps: number; dropPps: number };

  // Host-only technical fields
  arpTable?: HostArpRow[];
  sockets?: HostSocketRow[];
  ifaceStats?: IfaceStats;
  cpuPct?: number;
  memPct?: number;
};

const initialNodes: Node<TopologyNodeData>[] = [
  {
    id: "Controller-01",
    type: "controller",
    position: { x: 60, y: 40 },
    data: {
      id: "Controller-01",
      mgmtIp: "10.0.0.10",
      status: "online",
      responseLatencyMs: 7.8,
    },
  },
  {
    id: "Switch-01",
    type: "switch",
    position: { x: 120, y: 200 },
    data: {
      id: "Switch-01",
      dpid: "0000000000000001",
      mgmtIp: "10.0.0.1",
      ports: [
        { portNo: 1, name: "s1-eth1", rxPkts: 120340, txPkts: 110120, errors: 0 },
        { portNo: 2, name: "s1-eth2", rxPkts: 90340, txPkts: 100420, errors: 2 },
        { portNo: 3, name: "s1-eth3", rxPkts: 40210, txPkts: 30100, errors: 0 },
      ],
      flowTables: [
        { table: 0, priority: 100, match: "ip,nw_dst=10.0.0.0/24", actions: "output:1", packets: 92310, bytes: 91200340 },
        { table: 0, priority: 10, match: "arp", actions: "flood", packets: 1200, bytes: 220340 },
        { table: 1, priority: 50, match: "tcp,tp_dst=80", actions: "meter:1,output:2", packets: 8021, bytes: 14022340 },
      ],
      pktStats: { rxPps: 820, txPps: 780, dropPps: 4 },
    },
  },
  {
    id: "Switch-02",
    type: "switch",
    position: { x: 420, y: 220 },
    data: {
      id: "Switch-02",
      dpid: "0000000000000002",
      mgmtIp: "10.0.0.2",
      ports: [
        { portNo: 1, name: "s2-eth1", rxPkts: 60340, txPkts: 90420, errors: 0 },
        { portNo: 2, name: "s2-eth2", rxPkts: 40340, txPkts: 30420, errors: 0 },
        { portNo: 3, name: "s2-eth3", rxPkts: 12010, txPkts: 18100, errors: 1 },
      ],
      flowTables: [
        { table: 0, priority: 200, match: "ip,nw_dst=10.0.0.0/24", actions: "output:1", packets: 42310, bytes: 21200340 },
        { table: 0, priority: 10, match: "arp", actions: "flood", packets: 820, bytes: 160340 },
        { table: 1, priority: 50, match: "tcp,tp_dst=443", actions: "meter:2,output:2", packets: 5021, bytes: 9022340 },
      ],
      pktStats: { rxPps: 640, txPps: 610, dropPps: 2 },
    },
  },
  {
    id: "Host-A",
    type: "host",
    position: { x: 60, y: 340 },
    data: {
      id: "Host-A",
      ip: "10.0.0.101",
      mac: "aa:bb:cc:dd:ee:01",
      iface: "eth0",
      gateway: "10.0.0.1",
    },
  },
  {
    id: "Host-B",
    type: "host",
    position: { x: 220, y: 360 },
    data: {
      id: "Host-B",
      ip: "10.0.0.102",
      mac: "aa:bb:cc:dd:ee:02",
      iface: "eth0",
      gateway: "10.0.0.1",
    },
  },
  {
    id: "Host-C",
    type: "host",
    position: { x: 520, y: 360 },
    data: {
      id: "Host-C",
      ip: "10.0.0.201",
      mac: "aa:bb:cc:dd:ee:03",
      iface: "eth0",
      gateway: "10.0.0.2",
    },
  },
  {
    id: "Host-D",
    type: "host",
    position: { x: 700, y: 340 },
    data: {
      id: "Host-D",
      ip: "10.0.0.202",
      mac: "aa:bb:cc:dd:ee:04",
      iface: "eth0",
      gateway: "10.0.0.2",
    },
  },
];

const initialEdgesPhysical: Edge<LinkStatus>[] = [
  {
    id: "p-ctrl-s1",
    source: "Controller-01",
    target: "Switch-01",
    type: "util",
    animated: false,
    data: { mode: "physical", utilPct: 12, capacityMbps: 1000, lossPct: 0.0, up: true },
  },
  {
    id: "p-ctrl-s2",
    source: "Controller-01",
    target: "Switch-02",
    type: "util",
    animated: false,
    data: { mode: "physical", utilPct: 9, capacityMbps: 1000, lossPct: 0.1, up: true },
  },
  {
    id: "p-s1-s2",
    source: "Switch-01",
    target: "Switch-02",
    type: "util",
    animated: true,
    data: { mode: "physical", utilPct: 71, capacityMbps: 10000, lossPct: 4.2, up: true },
  },
  {
    id: "p-s1-ha",
    source: "Switch-01",
    target: "Host-A",
    type: "util",
    animated: false,
    data: { mode: "physical", utilPct: 42, capacityMbps: 1000, lossPct: 0.1, up: true },
  },
  {
    id: "p-s1-hb",
    source: "Switch-01",
    target: "Host-B",
    type: "util",
    animated: true,
    data: { mode: "physical", utilPct: 0.0, capacityMbps: 1000, lossPct: 0.0, up: false },
  },
  {
    id: "p-s2-hc",
    source: "Switch-02",
    target: "Host-C",
    type: "util",
    animated: false,
    data: { mode: "physical", utilPct: 23, capacityMbps: 1000, lossPct: 0.3, up: true },
  },
  {
    id: "p-s2-hd",
    source: "Switch-02",
    target: "Host-D",
    type: "util",
    animated: false,
    data: { mode: "physical", utilPct: 28, capacityMbps: 1000, lossPct: 0.2, up: true },
  },
];

const initialEdgesLogical: Edge<LinkStatus>[] = [
  {
    id: "l-ctrl-s1",
    source: "Controller-01",
    target: "Switch-01",
    type: "util",
    animated: false,
    data: { mode: "logical", up: true, lossPct: 0 },
  },
  {
    id: "l-ctrl-s2",
    source: "Controller-01",
    target: "Switch-02",
    type: "util",
    animated: false,
    data: { mode: "logical", up: true, lossPct: 0 },
  },
  {
    id: "l-s1-s2",
    source: "Switch-01",
    target: "Switch-02",
    type: "util",
    animated: false,
    data: { mode: "logical", up: true, lossPct: 0 },
  },
  {
    id: "l-s1-ha",
    source: "Switch-01",
    target: "Host-A",
    type: "util",
    animated: false,
    data: { mode: "logical", up: true, lossPct: 0 },
  },
  {
    id: "l-s1-hb",
    source: "Switch-01",
    target: "Host-B",
    type: "util",
    animated: false,
    data: { mode: "logical", up: true, lossPct: 0 },
  },
  {
    id: "l-s2-hc",
    source: "Switch-02",
    target: "Host-C",
    type: "util",
    animated: false,
    data: { mode: "logical", up: true, lossPct: 0 },
  },
  {
    id: "l-s2-hd",
    source: "Switch-02",
    target: "Host-D",
    type: "util",
    animated: false,
    data: { mode: "logical", up: true, lossPct: 0 },
  },
];

function randomWalk(prev: number, step: number, min: number, max: number) {
  const delta = (Math.random() * 2 - 1) * step;
  return Math.max(min, Math.min(max, prev + delta));
}

function synthArpTable(hostId: string): HostArpRow[] {
  const rows: HostArpRow[] = [
    { ip: "10.0.0.1", mac: "00:00:00:00:00:01", iface: "eth0", state: "REACHABLE" },
    { ip: "10.0.0.2", mac: "00:00:00:00:00:02", iface: "eth0", state: Math.random() < 0.15 ? "STALE" : "REACHABLE" },
    { ip: "10.0.0.254", mac: "00:00:00:00:fe:01", iface: "eth0", state: "REACHABLE" },
    { ip: "10.0.0.250", mac: "00:00:00:00:fa:01", iface: "eth0", state: "FAILED" },
  ];
  return rows.map((r) => ({ ...r, iface: `${hostId}-eth0` }));
}

function synthSockets(): HostSocketRow[] {
  return [
    { proto: "tcp", local: "10.0.0.101:55210", remote: "10.0.0.20:443", state: "ESTAB", pid: 2310, proc: "curl" },
    { proto: "tcp", local: "10.0.0.101:55212", remote: "10.0.0.30:80", state: "ESTAB", pid: 1221, proc: "python" },
    { proto: "udp", local: "10.0.0.101:53021", remote: "10.0.0.53:53", state: "UNCONN", pid: 830, proc: "systemd" },
    { proto: "tcp", local: "10.0.0.101:22", remote: "—", state: "LISTEN", pid: 640, proc: "sshd" },
  ];
}

function synthIfaceStats(hostId: string): IfaceStats {
  return {
    iface: `${hostId}-eth0`,
    rxMbps: 120,
    txMbps: 95,
    rxDrops: 0,
    txDrops: 0,
    errors: 0,
  };
}

type SelectedElement =
  | { kind: "node"; nodeId: string }
  | { kind: "edge"; edgeId: string }
  | null;

type TopologySnapshot = {
  capturedAt: string;
  mode: MapMode;
  nodes: Node<TopologyNodeData>[];
  edgesPhysical: Edge<LinkStatus>[];
  edgesLogical: Edge<LinkStatus>[];
};

function readSnapshotsFromStorage(): TopologySnapshot[] {
  try {
    const raw = localStorage.getItem("profissa.topology.snapshots");
    if (!raw) return [];
    const parsed = JSON.parse(raw) as TopologySnapshot[];
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

function summarizeSnapshotDiff(a: TopologySnapshot, b: TopologySnapshot) {
  const aNodeIds = new Set(a.nodes.map((n) => n.id));
  const bNodeIds = new Set(b.nodes.map((n) => n.id));

  let nodesAdded = 0;
  let nodesRemoved = 0;
  for (const id of bNodeIds) if (!aNodeIds.has(id)) nodesAdded++;
  for (const id of aNodeIds) if (!bNodeIds.has(id)) nodesRemoved++;

  const aNodeMap = new Map(a.nodes.map((n) => [n.id, n] as const));
  const bNodeMap = new Map(b.nodes.map((n) => [n.id, n] as const));
  let nodesMoved = 0;
  for (const id of aNodeIds) {
    const an = aNodeMap.get(id);
    const bn = bNodeMap.get(id);
    if (!an || !bn) continue;
    const dx = (an.position?.x ?? 0) - (bn.position?.x ?? 0);
    const dy = (an.position?.y ?? 0) - (bn.position?.y ?? 0);
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > 3) nodesMoved++;
  }

  const aPhysDown = (a.edgesPhysical ?? []).filter((e) => (e.data?.up ?? true) === false).length;
  const bPhysDown = (b.edgesPhysical ?? []).filter((e) => (e.data?.up ?? true) === false).length;
  const aPhysDanger = (a.edgesPhysical ?? []).filter((e) => (e.data?.lossPct ?? 0) >= 2.5).length;
  const bPhysDanger = (b.edgesPhysical ?? []).filter((e) => (e.data?.lossPct ?? 0) >= 2.5).length;

  return {
    nodesAdded,
    nodesRemoved,
    nodesMoved,
    physDownDelta: bPhysDown - aPhysDown,
    physDangerDelta: bPhysDanger - aPhysDanger,
  };
}

type ScenarioId = "base" | "all-ok" | "degraded" | "down" | "trace";

type ScenarioSpec = {
  id: ScenarioId;
  title: string;
  subtitle: string;
  apply: () => {
    mode: MapMode;
    nodes: Node<TopologyNodeData>[];
    edgesPhysical: Edge<LinkStatus>[];
    edgesLogical: Edge<LinkStatus>[];
    traceFrom?: string;
    traceTo?: string;
  };
};

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

function markTraceEdges(edges: Edge<LinkStatus>[], pairs: Array<[string, string]>) {
  return edges.map((e) => {
    const hit = pairs.some(([a, b]) => (e.source === a && e.target === b) || (e.source === b && e.target === a));
    if (!hit) return { ...e, data: { ...(e.data ?? ({ mode: "physical" } as LinkStatus)), trace: false }, animated: (e.data?.lossPct ?? 0) >= 2.5 || (e.data?.up ?? true) === false };
    return {
      ...e,
      animated: true,
      data: { ...(e.data ?? ({ mode: "physical" } as LinkStatus)), trace: true },
    };
  });
}

type HostDraft = {
  name: string;
  ip: string;
  mac: string;
  iface: string;
  gateway: string;
};

function nextId(prefix: string, used: Set<string>) {
  for (let i = 1; i < 9999; i++) {
    const id = `${prefix}${String(i).padStart(2, "0")}`;
    if (!used.has(id)) return id;
  }
  return `${prefix}${Date.now()}`;
}

function bfsPath(edges: Edge<LinkStatus>[], from: string, to: string) {
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    if (!e.source || !e.target) continue;
    const a = adj.get(e.source) ?? [];
    const b = adj.get(e.target) ?? [];
    a.push(e.target);
    b.push(e.source);
    adj.set(e.source, a);
    adj.set(e.target, b);
  }
  const q: string[] = [from];
  const prev = new Map<string, string | null>();
  prev.set(from, null);
  while (q.length) {
    const cur = q.shift()!;
    if (cur === to) break;
    for (const nb of adj.get(cur) ?? []) {
      if (prev.has(nb)) continue;
      prev.set(nb, cur);
      q.push(nb);
    }
  }
  if (!prev.has(to)) return null;
  const nodes: string[] = [];
  let cur: string | null = to;
  while (cur) {
    nodes.push(cur);
    cur = prev.get(cur) ?? null;
  }
  nodes.reverse();
  const edgePairs: Array<[string, string]> = [];
  for (let i = 0; i < nodes.length - 1; i++) edgePairs.push([nodes[i], nodes[i + 1]]);
  return { nodes, edgePairs };
}

function EditorInner() {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [nodes, setNodes] = useState<Node<TopologyNodeData>[]>(initialNodes);
  const [edgesPhysical, setEdgesPhysical] = useState<Edge<LinkStatus>[]>(initialEdgesPhysical);
  const [edgesLogical, setEdgesLogical] = useState<Edge<LinkStatus>[]>(initialEdgesLogical);
  const [mode, setMode] = useState<MapMode>("physical");

  const [selected, setSelected] = useState<SelectedElement>(null);

  const [menuOpen, setMenuOpen] = useState(false);
  const [hostModalOpen, setHostModalOpen] = useState(false);
  const [hostDraft, setHostDraft] = useState<HostDraft>({
    name: "Host-A",
    ip: "10.0.0.101",
    mac: "aa:bb:cc:dd:ee:ff",
    iface: "eth0",
    gateway: "10.0.0.1",
  });

  const [traceFrom, setTraceFrom] = useState<string>("Host-A");
  const [traceTo, setTraceTo] = useState<string>("Host-D");

  const [panelOpen, setPanelOpen] = useState<null | "snapshots" | "scenarios">(null);

  const [snapshots, setSnapshots] = useState<TopologySnapshot[]>([]);
  const [compareA, setCompareA] = useState<string | null>(null);
  const [compareB, setCompareB] = useState<string | null>(null);

  const edges = mode === "physical" ? edgesPhysical : edgesLogical;
  const setEdges = mode === "physical" ? setEdgesPhysical : setEdgesLogical;

  const selectedNode = useMemo(() => {
    if (!selected || selected.kind !== "node") return null;
    return nodes.find((n) => n.id === selected.nodeId) ?? null;
  }, [nodes, selected]);

  const selectedEdge = useMemo(() => {
    if (!selected || selected.kind !== "edge") return null;
    return (
      edgesPhysical.find((e) => e.id === selected.edgeId) ??
      edgesLogical.find((e) => e.id === selected.edgeId) ??
      null
    );
  }, [edgesLogical, edgesPhysical, selected]);

  const countByType = useMemo(() => {
    const res: Record<NodeKind, number> = { host: 0, switch: 0, controller: 0 };
    for (const n of nodes) {
      if (n.type === "host") res.host++;
      else if (n.type === "switch") res.switch++;
      else if (n.type === "controller") res.controller++;
    }
    return res;
  }, [nodes]);

  const placeNewNode = useCallback(
    (kind: NodeKind) => {
      const bounds = wrapperRef.current?.getBoundingClientRect();
      const w = bounds?.width ?? 1100;

      const padX = 80;
      const padY = 90;

      if (kind === "controller") {
        const i = countByType.controller;
        return { x: padX + i * 260, y: 40 };
      }
      if (kind === "switch") {
        const i = countByType.switch;
        return { x: padX + (i % 3) * 300, y: 200 + Math.floor(i / 3) * 180 };
      }

      const i = countByType.host;
      const cols = Math.max(2, Math.floor((w - padX * 2) / 220));
      return {
        x: padX + (i % cols) * 220,
        y: 380 + Math.floor(i / cols) * 160 + padY,
      };
    },
    [countByType.controller, countByType.host, countByType.switch],
  );

  const reloadSnapshots = useCallback(() => {
    setSnapshots(readSnapshotsFromStorage());
  }, []);

  useEffect(() => {
    reloadSnapshots();
  }, [reloadSnapshots]);

  useEffect(() => {
    const id = setInterval(() => {
      setNodes((prev) =>
        prev.map((n) => {
          if (n.type === "switch") {
            const stats = n.data.pktStats ?? { rxPps: 0, txPps: 0, dropPps: 0 };
            const rxPps = Math.max(0, stats.rxPps + Math.round((Math.random() * 2 - 1) * 60));
            const txPps = Math.max(0, stats.txPps + Math.round((Math.random() * 2 - 1) * 60));
            const dropPps = Math.max(0, stats.dropPps + Math.round((Math.random() * 2 - 1) * 2));
            return { ...n, data: { ...n.data, pktStats: { rxPps, txPps, dropPps } } };
          }
          if (n.type === "host") {
            const cpuPct = randomWalk(n.data.cpuPct ?? 18, 3.5, 0, 100);
            const memPct = randomWalk(n.data.memPct ?? 42, 2.8, 0, 100);
            const ifaceStats = n.data.ifaceStats ?? synthIfaceStats(n.id);
            return {
              ...n,
              data: {
                ...n.data,
                cpuPct,
                memPct,
                ifaceStats: {
                  ...ifaceStats,
                  rxMbps: randomWalk(ifaceStats.rxMbps, 18, 0, 950),
                  txMbps: randomWalk(ifaceStats.txMbps, 18, 0, 950),
                },
              },
            };
          }
          if (n.type === "controller") {
            const responseLatencyMs = randomWalk(n.data.responseLatencyMs ?? 8, 1.8, 0.2, 200);
            return { ...n, data: { ...n.data, responseLatencyMs } };
          }
          return n;
        }),
      );
    }, 900);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (mode !== "physical") return;
    const id = setInterval(() => {
      setEdgesPhysical((prev) =>
        prev.map((e) => {
          const d = e.data ?? { mode: "physical" };
          if (d.mode !== "physical") return e;
          const util = randomWalk(d.utilPct ?? 20, 8, 0, 100);
          const loss = Math.max(0, randomWalk(d.lossPct ?? 0.1, 0.2, 0, 8));
          const up = d.up ?? true;
          const flap = Math.random() < 0.008;
          return {
            ...e,
            animated: (loss >= 2.5 || !up) && !(d.trace ?? false),
            data: { ...d, utilPct: util, lossPct: loss, up: flap ? !up : up },
          };
        }),
      );
    }, 950);
    return () => clearInterval(id);
  }, [mode]);

  const onConnect: OnConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;
      setEdges((eds) =>
        addEdge(
          {
            ...connection,
            type: "util",
            animated: false,
            data:
              mode === "physical"
                ? ({ mode: "physical", utilPct: 10, capacityMbps: 1000, lossPct: 0.0, up: true } satisfies LinkStatus)
                : ({ mode: "logical", up: true, lossPct: 0 } satisfies LinkStatus),
          },
          eds,
        ),
      );
      setMenuOpen(false);
    },
    [mode, setEdges],
  );

  const onNodeClick = useCallback((_: any, node: Node<TopologyNodeData>) => {
    setSelected({ kind: "node", nodeId: node.id });
    setMenuOpen(false);
  }, []);

  const onEdgeClick = useCallback((_: any, edge: Edge<LinkStatus>) => {
    setSelected({ kind: "edge", edgeId: edge.id });
    setMenuOpen(false);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelected(null);
    setMenuOpen(false);
  }, []);

  const updateSelectedNode = useCallback(
    (patch: Partial<TopologyNodeData>) => {
      if (!selectedNode) return;
      const nodeId = selectedNode.id;
      setNodes((prev) => prev.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, ...patch } } : n)));
      setSelected((prevSel) =>
        prevSel && prevSel.kind === "node" && prevSel.nodeId === nodeId ? prevSel : prevSel,
      );
    },
    [selectedNode],
  );

  const clearTrace = useCallback(() => {
    setEdgesPhysical((prev) => prev.map((e) => ({ ...e, data: { ...(e.data ?? { mode: "physical" }), trace: false } })));
    setEdgesLogical((prev) => prev.map((e) => ({ ...e, data: { ...(e.data ?? { mode: "logical" }), trace: false } })));
  }, []);

  const runTrace = useCallback(() => {
    clearTrace();
    const p = bfsPath(edges, traceFrom, traceTo);
    if (!p) return;
    setEdges((prev) =>
      prev.map((e) => {
        const hit = p.edgePairs.some(([a, b]) => (e.source === a && e.target === b) || (e.source === b && e.target === a));
        if (!hit) return e;
        return {
          ...e,
          animated: true,
          data: { ...(e.data ?? ({ mode: mode === "physical" ? "physical" : "logical" } as LinkStatus)), trace: true },
        };
      }),
    );
  }, [clearTrace, edges, mode, setEdges, traceFrom, traceTo]);

  const captureSnapshot = useCallback(() => {
    const key = "profissa.topology.snapshots";
    const prev = readSnapshotsFromStorage();
    const payload = {
      capturedAt: new Date().toISOString(),
      mode,
      nodes,
      edgesPhysical,
      edgesLogical,
    };
    const next = [payload, ...prev].slice(0, 50);
    localStorage.setItem(key, JSON.stringify(next));
    reloadSnapshots();
  }, [edgesLogical, edgesPhysical, mode, nodes]);

  const applySnapshot = useCallback((snap: TopologySnapshot) => {
    setMode(snap.mode);
    setNodes(snap.nodes);
    setEdgesPhysical(snap.edgesPhysical);
    setEdgesLogical(snap.edgesLogical);
    setPanelOpen(null);
  }, []);

  const usedIds = useMemo(() => new Set(nodes.map((n) => n.id)), [nodes]);

  const addSwitch = useCallback(() => {
    const id = nextId("Switch-", usedIds);
    const pos = placeNewNode("switch");
    setNodes((prev) =>
      prev.concat({
        id,
        type: "switch",
        position: pos,
        data: {
          id,
          dpid: "0000000000000000",
          mgmtIp: "10.0.0.1",
          pktStats: { rxPps: 200, txPps: 180, dropPps: 0 },
          ports: [
            { portNo: 1, name: `${id}-eth1`, rxPkts: 0, txPkts: 0, errors: 0 },
            { portNo: 2, name: `${id}-eth2`, rxPkts: 0, txPkts: 0, errors: 0 },
          ],
          flowTables: [
            { table: 0, priority: 100, match: "ip", actions: "output:1", packets: 0, bytes: 0 },
            { table: 0, priority: 10, match: "arp", actions: "flood", packets: 0, bytes: 0 },
          ],
        },
      }),
    );
  }, [placeNewNode, usedIds]);

  const addController = useCallback(() => {
    const id = nextId("Controller-", usedIds);
    const pos = placeNewNode("controller");
    setNodes((prev) =>
      prev.concat({
        id,
        type: "controller",
        position: pos,
        data: { id, mgmtIp: "10.0.0.10", status: "online", responseLatencyMs: 8 },
      }),
    );
  }, [placeNewNode, usedIds]);

  const addHost = useCallback(() => {
    setHostDraft((d) => ({
      ...d,
      name: nextId("Host-", usedIds).replace("Host-", "Host-"),
      ip: `10.0.0.${100 + Math.floor(Math.random() * 120)}`,
      mac: `aa:bb:cc:dd:ee:${Math.floor(Math.random() * 255).toString(16).padStart(2, "0")}`,
      iface: "eth0",
      gateway: "10.0.0.1",
    }));
    setMenuOpen(false);
    setHostModalOpen(true);
  }, [usedIds]);

  useEffect(() => {
    // Avoid stale selection when changing map mode.
    if (selected && selected.kind === "edge") setSelected(null);
    setMenuOpen(false);
  }, [mode]);

  const submitHost = useCallback(() => {
    const id = hostDraft.name.trim() || nextId("Host-", usedIds);
    const pos = placeNewNode("host");

    setNodes((prev) =>
      prev.concat({
        id,
        type: "host",
        position: pos,
        data: {
          id,
          ip: hostDraft.ip,
          mac: hostDraft.mac,
          iface: hostDraft.iface,
          gateway: hostDraft.gateway,
          arpTable: synthArpTable(id),
          sockets: synthSockets(),
          ifaceStats: synthIfaceStats(id),
          cpuPct: 18,
          memPct: 42,
        },
      }),
    );

    setHostModalOpen(false);
    setMenuOpen(false);
  }, [hostDraft, placeNewNode, usedIds]);

  const scenarios = useMemo<ScenarioSpec[]>(() => {
    const baseNodes = () => clone(initialNodes);
    const basePhys = () => clone(initialEdgesPhysical);
    const baseLog = () => clone(initialEdgesLogical);

    return [
      {
        id: "base",
        title: "Base (demo)",
        subtitle: "Topologia completa com perda alta e 1 link DOWN",
        apply: () => ({ mode: "physical", nodes: baseNodes(), edgesPhysical: basePhys(), edgesLogical: baseLog(), traceFrom: "Host-A", traceTo: "Host-D" }),
      },
      {
        id: "all-ok",
        title: "Tudo OK (visual)",
        subtitle: "Links UP, perda baixa, sem pulse/dotted",
        apply: () => {
          const phys = basePhys().map((e) => ({
            ...e,
            animated: false,
            data: { ...(e.data ?? { mode: "physical" }), up: true, lossPct: 0.1, utilPct: e.data?.utilPct ?? 15, trace: false },
          }));
          return { mode: "physical", nodes: baseNodes(), edgesPhysical: phys, edgesLogical: baseLog(), traceFrom: "Host-A", traceTo: "Host-D" };
        },
      },
      {
        id: "degraded",
        title: "Degradação (perda alta)",
        subtitle: "Força pulse + dotted no backbone",
        apply: () => {
          const phys = basePhys().map((e) => {
            if (e.id !== "p-s1-s2") return { ...e, data: { ...(e.data ?? { mode: "physical" }), trace: false } };
            return { ...e, animated: true, data: { ...(e.data ?? { mode: "physical" }), up: true, lossPct: 5.6, utilPct: 79 } };
          });
          return { mode: "physical", nodes: baseNodes(), edgesPhysical: phys, edgesLogical: baseLog(), traceFrom: "Host-A", traceTo: "Host-D" };
        },
      },
      {
        id: "down",
        title: "Falha (DOWN)",
        subtitle: "Força link de acesso DOWN (dashed + pulse)",
        apply: () => {
          const phys = basePhys().map((e) => {
            if (e.id !== "p-s1-hb") return { ...e, data: { ...(e.data ?? { mode: "physical" }), trace: false } };
            return { ...e, animated: true, data: { ...(e.data ?? { mode: "physical" }), up: false, lossPct: 0, utilPct: 0 } };
          });
          return { mode: "physical", nodes: baseNodes(), edgesPhysical: phys, edgesLogical: baseLog(), traceFrom: "Host-B", traceTo: "Switch-01" };
        },
      },
      {
        id: "trace",
        title: "TracePath (visual)",
        subtitle: "Marca caminho Host-A → Host-D",
        apply: () => {
          const phys = markTraceEdges(basePhys(), [
            ["Host-A", "Switch-01"],
            ["Switch-01", "Switch-02"],
            ["Switch-02", "Host-D"],
          ]);
          return { mode: "physical", nodes: baseNodes(), edgesPhysical: phys, edgesLogical: baseLog(), traceFrom: "Host-A", traceTo: "Host-D" };
        },
      },
    ];
  }, []);

  const applyScenario = useCallback((id: ScenarioId) => {
    const spec = scenarios.find((s) => s.id === id);
    if (!spec) return;
    const next = spec.apply();
    setMode(next.mode);
    setNodes(next.nodes);
    setEdgesPhysical(next.edgesPhysical);
    setEdgesLogical(next.edgesLogical);
    if (next.traceFrom) setTraceFrom(next.traceFrom);
    if (next.traceTo) setTraceTo(next.traceTo);
    setPanelOpen(null);
  }, [scenarios]);

  const drawerOpen = selectedNode !== null || selectedEdge !== null;

  return (
    <div className="relative space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-[14px] font-semibold tracking-tight">Topologia Interativa</div>
          <div className="text-[11px] text-fg-1">Editor completo (React Flow) · gestão de infraestrutura</div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1">
            <Button
              variant={mode === "logical" ? "primary" : "ghost"}
              className="h-8"
              onClick={() => {
                setMode("logical");
                setSelected(null);
                setMenuOpen(false);
              }}
            >
              Mapa Lógico
            </Button>
            <Button
              variant={mode === "physical" ? "primary" : "ghost"}
              className="h-8"
              onClick={() => {
                setMode("physical");
                setSelected(null);
                setMenuOpen(false);
              }}
            >
              Mapa Físico
            </Button>
          </div>

          <Button
            variant={panelOpen === "snapshots" ? "primary" : "ghost"}
            className="h-8"
            onClick={() => setPanelOpen((p) => (p === "snapshots" ? null : "snapshots"))}
          >
            Snapshots
          </Button>
          <Button
            variant={panelOpen === "scenarios" ? "primary" : "ghost"}
            className="h-8"
            onClick={() => setPanelOpen((p) => (p === "scenarios" ? null : "scenarios"))}
          >
            Cenários
          </Button>

          <div className="flex items-center gap-2 rounded-lg border border-border-0/60 bg-bg-1/40 px-2 py-1">
            <div className="text-[10px] font-medium text-fg-1">TracePath</div>
            <select
              className="h-7 rounded-md border border-border-0/60 bg-bg-2/40 px-2 text-[11px] text-fg-0 focus-visible:outline-none"
              value={traceFrom}
              onChange={(e) => setTraceFrom(e.target.value)}
            >
              {nodes.map((n) => (
                <option key={n.id} value={n.id}>{n.id}</option>
              ))}
            </select>
            <select
              className="h-7 rounded-md border border-border-0/60 bg-bg-2/40 px-2 text-[11px] text-fg-0 focus-visible:outline-none"
              value={traceTo}
              onChange={(e) => setTraceTo(e.target.value)}
            >
              {nodes.map((n) => (
                <option key={n.id} value={n.id}>{n.id}</option>
              ))}
            </select>
            <Button variant="ghost" className="h-7 px-2 text-[11px]" onClick={runTrace}>Executar</Button>
            <Button variant="ghost" className="h-7 px-2 text-[11px]" onClick={clearTrace}>Limpar</Button>
          </div>

          <Button variant="ghost" className="h-8" onClick={captureSnapshot}>Capturar Snapshot</Button>
        </div>
      </div>

      {panelOpen ? (
        <div className="rounded-xl border border-border-0/60 bg-bg-0/60 p-2 backdrop-blur">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="text-[11px] font-medium text-fg-1">
              {panelOpen === "snapshots" ? "Snapshots" : "Cenários de teste"}
            </div>
            <Button variant="ghost" className="h-7 px-2 text-[11px]" onClick={() => setPanelOpen(null)}>
              Fechar
            </Button>
          </div>

          <div className="max-h-[240px] overflow-auto pr-1">
            {panelOpen === "scenarios" ? (
              <div className="grid grid-cols-1 gap-2">
                {scenarios.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => applyScenario(s.id)}
                    className={cn(
                      "rounded-xl border border-border-0/60 bg-bg-1/40 p-2 text-left",
                      "hover:bg-bg-2/30",
                    )}
                  >
                    <div className="text-[12px] font-semibold text-fg-0">{s.title}</div>
                    <div className="mt-0.5 text-[11px] text-fg-1">{s.subtitle}</div>
                  </button>
                ))}
              </div>
            ) : snapshots.length === 0 ? (
              <div className="rounded-lg border border-border-0/60 bg-bg-1/40 p-2 text-[11px] text-fg-1">
                Nenhum snapshot ainda. Use “Capturar Snapshot”.
              </div>
            ) : (
              <div className="space-y-2">
                {snapshots.map((s) => (
                  <div key={s.capturedAt} className="rounded-lg border border-border-0/60 bg-bg-1/40 p-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-mono text-[11px] text-fg-0">{new Date(s.capturedAt).toLocaleString()}</div>
                        <div className="mt-0.5 text-[10px] text-fg-1">
                          modo=<span className="font-mono text-fg-0">{s.mode}</span> · nós=<span className="font-mono text-fg-0">{s.nodes.length}</span> · phys=<span className="font-mono text-fg-0">{s.edgesPhysical.length}</span> · log=<span className="font-mono text-fg-0">{s.edgesLogical.length}</span>
                        </div>
                      </div>
                      <Button variant="ghost" className="h-7 px-2 text-[11px]" onClick={() => applySnapshot(s)}>
                        Aplicar
                      </Button>
                    </div>

                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button
                        variant={compareA === s.capturedAt ? "primary" : "ghost"}
                        className="h-7 px-2 text-[11px]"
                        onClick={() => setCompareA((p) => (p === s.capturedAt ? null : s.capturedAt))}
                      >
                        Marcar A
                      </Button>
                      <Button
                        variant={compareB === s.capturedAt ? "primary" : "ghost"}
                        className="h-7 px-2 text-[11px]"
                        onClick={() => setCompareB((p) => (p === s.capturedAt ? null : s.capturedAt))}
                      >
                        Marcar B
                      </Button>
                    </div>
                  </div>
                ))}

                {compareA && compareB ? (
                  (() => {
                    const a = snapshots.find((s) => s.capturedAt === compareA);
                    const b = snapshots.find((s) => s.capturedAt === compareB);
                    if (!a || !b) return null;
                    const diff = summarizeSnapshotDiff(a, b);
                    return (
                      <div className="rounded-lg border border-border-0/60 bg-bg-1/40 p-2">
                        <div className="mb-2 text-[11px] font-medium text-fg-1">Comparação (A → B)</div>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div className="rounded-md border border-border-0/60 bg-bg-2/20 p-2">
                            <div className="text-[10px] uppercase tracking-wide text-fg-1">nós</div>
                            <div className="mt-0.5 font-mono text-[12px] text-fg-0">+{diff.nodesAdded} / -{diff.nodesRemoved}</div>
                          </div>
                          <div className="rounded-md border border-border-0/60 bg-bg-2/20 p-2">
                            <div className="text-[10px] uppercase tracking-wide text-fg-1">movidos</div>
                            <div className="mt-0.5 font-mono text-[12px] text-fg-0">{diff.nodesMoved}</div>
                          </div>
                          <div className="rounded-md border border-border-0/60 bg-bg-2/20 p-2">
                            <div className="text-[10px] uppercase tracking-wide text-fg-1">down (phys)</div>
                            <div className={cn("mt-0.5 font-mono text-[12px]", diff.physDownDelta > 0 ? "text-accent-danger" : "text-fg-0")}>
                              {diff.physDownDelta >= 0 ? "+" : ""}
                              {diff.physDownDelta}
                            </div>
                          </div>
                          <div className="rounded-md border border-border-0/60 bg-bg-2/20 p-2">
                            <div className="text-[10px] uppercase tracking-wide text-fg-1">perda alta (phys)</div>
                            <div className={cn("mt-0.5 font-mono text-[12px]", diff.physDangerDelta > 0 ? "text-accent-danger" : "text-fg-0")}>
                              {diff.physDangerDelta >= 0 ? "+" : ""}
                              {diff.physDangerDelta}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })()
                ) : null}
              </div>
            )}
          </div>
        </div>
      ) : null}

      <div className={cn("grid gap-3", drawerOpen ? "grid-cols-[1fr_360px]" : "grid-cols-1")}>
        <div className="min-w-0">
          <div ref={wrapperRef} className="relative h-[74vh] w-full overflow-hidden rounded-xl border border-border-0/60">
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onConnect={onConnect}
              onNodeClick={onNodeClick}
              onEdgeClick={onEdgeClick}
              onPaneClick={onPaneClick}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              fitView
            >
              <Background gap={18} size={1} color="rgba(40,49,73,0.9)" />
              <Controls />
            </ReactFlow>

            {/* Floating + button (inside canvas, so it never covers the drawer) */}
            <div
              className="absolute bottom-3 right-3 z-10"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
            >
              {menuOpen ? (
                <div className="mb-2 w-[220px] rounded-xl border border-border-0/60 bg-bg-0/90 p-2 text-[11px] text-fg-1 backdrop-blur">
                  <div className="mb-2 text-[10px] font-medium uppercase tracking-wide text-fg-1">Adicionar</div>
                  <div className="space-y-1">
                    <Button className="w-full justify-start" variant="ghost" onClick={addHost}>Adicionar Host</Button>
                    <Button className="w-full justify-start" variant="ghost" onClick={() => { addSwitch(); setMenuOpen(false); }}>Adicionar Switch</Button>
                    <Button className="w-full justify-start" variant="ghost" onClick={() => { addController(); setMenuOpen(false); }}>Adicionar Controlador</Button>
                  </div>
                </div>
              ) : null}

              <Button
                variant="primary"
                className="h-10 w-10 justify-center rounded-full px-0 text-[16px]"
                onClick={() => setMenuOpen((p) => !p)}
                aria-label="Adicionar"
                title="Adicionar"
              >
                +
              </Button>
            </div>
          </div>
        </div>

        {drawerOpen ? (
          <aside className="min-w-0">
            <div className="sticky top-12 h-[74vh] overflow-hidden rounded-xl border border-border-0/60 bg-bg-0/70 backdrop-blur">
              <div className="flex items-center justify-between border-b border-border-0/60 px-3 py-2">
                <div className="text-[12px] font-semibold text-fg-0">Deep-Dive</div>
                <Button variant="ghost" className="h-7 px-2 text-[11px]" onClick={() => setSelected(null)}>Fechar</Button>
              </div>

              <div className="h-[calc(74vh-41px)] overflow-auto px-3 py-2">
                {selectedEdge ? (
            <div className="space-y-2">
              <div className="text-[11px] text-fg-1">Link selecionado</div>
              <div className="rounded-lg border border-border-0/60 bg-bg-1/40 p-2">
                <div className="text-[11px] text-fg-1">Endpoints</div>
                <div className="mt-1 font-mono text-[11px] text-fg-0">{selectedEdge.source} ↔ {selectedEdge.target}</div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg border border-border-0/60 bg-bg-1/40 p-2">
                  <div className="text-[10px] uppercase tracking-wide text-fg-1">utilização</div>
                  <div className="mt-0.5 font-mono text-[12px] text-fg-0">{(selectedEdge.data?.utilPct ?? 0).toFixed(0)}%</div>
                </div>
                <div className="rounded-lg border border-border-0/60 bg-bg-1/40 p-2">
                  <div className="text-[10px] uppercase tracking-wide text-fg-1">perda</div>
                  <div className={cn("mt-0.5 font-mono text-[12px]", (selectedEdge.data?.lossPct ?? 0) >= 2.5 ? "text-accent-danger" : "text-fg-0")}>
                    {(selectedEdge.data?.lossPct ?? 0).toFixed(2)}%
                  </div>
                </div>
                <div className="rounded-lg border border-border-0/60 bg-bg-1/40 p-2">
                  <div className="text-[10px] uppercase tracking-wide text-fg-1">status</div>
                  <div className={cn("mt-0.5 font-mono text-[12px]", (selectedEdge.data?.up ?? true) ? "text-accent-ok" : "text-accent-danger")}>
                    {(selectedEdge.data?.up ?? true) ? "UP" : "DOWN"}
                  </div>
                </div>
                <div className="rounded-lg border border-border-0/60 bg-bg-1/40 p-2">
                  <div className="text-[10px] uppercase tracking-wide text-fg-1">modo</div>
                  <div className="mt-0.5 font-mono text-[12px] text-fg-0">{selectedEdge.data?.mode ?? mode}</div>
                </div>
              </div>
            </div>
                ) : selectedNode ? (
            <>
              <div className="mb-2 text-[11px] text-fg-1">Elemento: <span className="font-mono text-fg-0">{selectedNode.id}</span></div>

              {selectedNode.type === "host" ? (
                <div className="space-y-2">
                  <div className="rounded-lg border border-border-0/60 bg-bg-1/40 p-2">
                    <div className="mb-1 text-[11px] font-medium text-fg-1">Host</div>
                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      <div>
                        <div className="text-[10px] uppercase tracking-wide text-fg-1">IP</div>
                        <div className="font-mono text-fg-0">{selectedNode.data.ip ?? "—"}</div>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase tracking-wide text-fg-1">MAC</div>
                        <div className="font-mono text-fg-0">{selectedNode.data.mac ?? "—"}</div>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase tracking-wide text-fg-1">IFACE</div>
                        <div className="font-mono text-fg-0">{selectedNode.data.iface ?? "—"}</div>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase tracking-wide text-fg-1">GW</div>
                        <div className="font-mono text-fg-0">{selectedNode.data.gateway ?? "—"}</div>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-lg border border-border-0/60 bg-bg-1/40 p-2">
                      <div className="text-[10px] uppercase tracking-wide text-fg-1">CPU</div>
                      <div className="mt-0.5 font-mono text-[12px] text-fg-0">{(selectedNode.data.cpuPct ?? 0).toFixed(0)}%</div>
                    </div>
                    <div className="rounded-lg border border-border-0/60 bg-bg-1/40 p-2">
                      <div className="text-[10px] uppercase tracking-wide text-fg-1">Mem</div>
                      <div className="mt-0.5 font-mono text-[12px] text-fg-0">{(selectedNode.data.memPct ?? 0).toFixed(0)}%</div>
                    </div>
                  </div>

                  <div className="rounded-lg border border-border-0/60 bg-bg-1/40 p-2">
                    <div className="mb-2 text-[11px] font-medium text-fg-1">Tabela ARP</div>
                    <div className="overflow-auto rounded-md border border-border-0/60">
                      <table className="w-full min-w-[520px] border-collapse text-left text-xs">
                        <thead className="bg-bg-1/60">
                          <tr className="border-b border-border-0/60 text-[10px] uppercase tracking-wide text-fg-1">
                            <th className="px-2 py-2 font-medium">IP</th>
                            <th className="px-2 py-2 font-medium">MAC</th>
                            <th className="px-2 py-2 font-medium">IF</th>
                            <th className="px-2 py-2 font-medium">State</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(selectedNode.data.arpTable ?? synthArpTable(selectedNode.id)).map((r) => (
                            <tr key={r.ip} className="border-b border-border-0/30 hover:bg-bg-2/20">
                              <td className="px-2 py-2 font-mono text-[11px] text-fg-0">{r.ip}</td>
                              <td className="px-2 py-2 font-mono text-[11px] text-fg-1">{r.mac}</td>
                              <td className="px-2 py-2 font-mono text-[11px] text-fg-1">{r.iface}</td>
                              <td className={cn("px-2 py-2 font-mono text-[11px]", r.state === "FAILED" ? "text-accent-danger" : "text-fg-0")}>
                                {r.state}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="rounded-lg border border-border-0/60 bg-bg-1/40 p-2">
                    <div className="mb-2 text-[11px] font-medium text-fg-1">Sockets ativos (ss)</div>
                    <div className="overflow-auto rounded-md border border-border-0/60">
                      <table className="w-full min-w-[720px] border-collapse text-left text-xs">
                        <thead className="bg-bg-1/60">
                          <tr className="border-b border-border-0/60 text-[10px] uppercase tracking-wide text-fg-1">
                            <th className="px-2 py-2 font-medium">Proto</th>
                            <th className="px-2 py-2 font-medium">Local</th>
                            <th className="px-2 py-2 font-medium">Remote</th>
                            <th className="px-2 py-2 font-medium">State</th>
                            <th className="px-2 py-2 font-medium">PID</th>
                            <th className="px-2 py-2 font-medium">Proc</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(selectedNode.data.sockets ?? synthSockets()).map((s, idx) => (
                            <tr key={`${s.local}-${idx}`} className="border-b border-border-0/30 hover:bg-bg-2/20">
                              <td className="px-2 py-2 font-mono text-[11px] text-fg-0">{s.proto}</td>
                              <td className="px-2 py-2 font-mono text-[11px] text-fg-1">{s.local}</td>
                              <td className="px-2 py-2 font-mono text-[11px] text-fg-1">{s.remote}</td>
                              <td className="px-2 py-2 font-mono text-[11px] text-fg-0">{s.state}</td>
                              <td className="px-2 py-2 font-mono text-[11px] text-fg-0">{s.pid}</td>
                              <td className="px-2 py-2 font-mono text-[11px] text-fg-1">{s.proc}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="rounded-lg border border-border-0/60 bg-bg-1/40 p-2">
                    <div className="mb-2 text-[11px] font-medium text-fg-1">Estatísticas de Interface</div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="rounded-md border border-border-0/60 bg-bg-2/20 p-2">
                        <div className="text-[10px] uppercase tracking-wide text-fg-1">RX</div>
                        <div className="mt-0.5 font-mono text-[12px] text-fg-0">{(selectedNode.data.ifaceStats?.rxMbps ?? 0).toFixed(1)} Mbps</div>
                      </div>
                      <div className="rounded-md border border-border-0/60 bg-bg-2/20 p-2">
                        <div className="text-[10px] uppercase tracking-wide text-fg-1">TX</div>
                        <div className="mt-0.5 font-mono text-[12px] text-fg-0">{(selectedNode.data.ifaceStats?.txMbps ?? 0).toFixed(1)} Mbps</div>
                      </div>
                      <div className="rounded-md border border-border-0/60 bg-bg-2/20 p-2">
                        <div className="text-[10px] uppercase tracking-wide text-fg-1">Drops</div>
                        <div className="mt-0.5 font-mono text-[12px] text-fg-0">{selectedNode.data.ifaceStats?.rxDrops ?? 0}/{selectedNode.data.ifaceStats?.txDrops ?? 0}</div>
                      </div>
                      <div className="rounded-md border border-border-0/60 bg-bg-2/20 p-2">
                        <div className="text-[10px] uppercase tracking-wide text-fg-1">Errors</div>
                        <div className="mt-0.5 font-mono text-[12px] text-fg-0">{selectedNode.data.ifaceStats?.errors ?? 0}</div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : selectedNode.type === "switch" ? (
                <div className="space-y-2">
                  <div>
                    <div className="mb-1 text-[11px] font-medium text-fg-1">ID do Switch</div>
                    <Input value={selectedNode.data.id} onChange={(e) => updateSelectedNode({ id: e.target.value })} />
                  </div>
                  <div>
                    <div className="mb-1 text-[11px] font-medium text-fg-1">Versão OpenFlow</div>
                    <Input value={(selectedNode.data as any).ofVersion ?? "OpenFlow13"} onChange={(e) => updateSelectedNode({ ...(selectedNode.data as any), ofVersion: e.target.value } as any)} />
                  </div>

                  <div className="rounded-lg border border-border-0/60 bg-bg-1/40 p-2">
                    <div className="mb-2 text-[11px] font-medium text-fg-1">Estatísticas de pacotes</div>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div className="rounded-md border border-border-0/60 bg-bg-2/20 p-2">
                        <div className="text-[10px] uppercase tracking-wide text-fg-1">rx pps</div>
                        <div className="mt-0.5 font-mono text-[12px] text-fg-0">{selectedNode.data.pktStats?.rxPps ?? 0}</div>
                      </div>
                      <div className="rounded-md border border-border-0/60 bg-bg-2/20 p-2">
                        <div className="text-[10px] uppercase tracking-wide text-fg-1">tx pps</div>
                        <div className="mt-0.5 font-mono text-[12px] text-fg-0">{selectedNode.data.pktStats?.txPps ?? 0}</div>
                      </div>
                      <div className="rounded-md border border-border-0/60 bg-bg-2/20 p-2">
                        <div className="text-[10px] uppercase tracking-wide text-fg-1">drop pps</div>
                        <div className="mt-0.5 font-mono text-[12px] text-fg-0">{selectedNode.data.pktStats?.dropPps ?? 0}</div>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-lg border border-border-0/60 bg-bg-1/40 p-2">
                    <div className="mb-2 text-[11px] font-medium text-fg-1">Flow Table (completa)</div>
                    <div className="overflow-auto rounded-md border border-border-0/60">
                      <table className="w-full min-w-[860px] border-collapse text-left text-xs">
                        <thead className="bg-bg-1/60">
                          <tr className="border-b border-border-0/60 text-[10px] uppercase tracking-wide text-fg-1">
                            <th className="px-2 py-2 font-medium">Priority</th>
                            <th className="px-2 py-2 font-medium">Match</th>
                            <th className="px-2 py-2 font-medium">Actions</th>
                            <th className="px-2 py-2 font-medium">Packets</th>
                            <th className="px-2 py-2 font-medium">Bytes</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(selectedNode.data.flowTables ?? []).map((f, idx) => (
                            <tr key={`${f.priority}-${idx}`} className="border-b border-border-0/30 hover:bg-bg-2/20">
                              <td className="px-2 py-2 font-mono text-[11px] text-fg-0">{f.priority}</td>
                              <td className="px-2 py-2 font-mono text-[11px] text-fg-1">{f.match}</td>
                              <td className="px-2 py-2 font-mono text-[11px] text-fg-1">{f.actions}</td>
                              <td className="px-2 py-2 font-mono text-[11px] text-fg-0">{f.packets}</td>
                              <td className="px-2 py-2 font-mono text-[11px] text-fg-0">{f.bytes}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="rounded-lg border border-border-0/60 bg-bg-1/40 p-2">
                    <div className="mb-1 text-[11px] font-medium text-fg-1">Controlador</div>
                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      <div>
                        <div className="text-[10px] uppercase tracking-wide text-fg-1">Status</div>
                        <div className={cn("font-mono", selectedNode.data.status === "online" ? "text-accent-ok" : "text-accent-danger")}>
                          {selectedNode.data.status ?? "—"}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase tracking-wide text-fg-1">Latência</div>
                        <div className="font-mono text-fg-0">{(selectedNode.data.responseLatencyMs ?? 0).toFixed(1)} ms</div>
                      </div>
                      <div className="col-span-2">
                        <div className="text-[10px] uppercase tracking-wide text-fg-1">Switches sob gestão</div>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {nodes.filter((n) => n.type === "switch").map((s) => (
                            <span key={s.id} className="rounded-md border border-border-0/60 bg-bg-2/20 px-2 py-0.5 font-mono text-[10px] text-fg-0">
                              {s.id}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
                ) : null}
              </div>
            </div>
          </aside>
        ) : null}
      </div>

      {/* Host modal */}
      {hostModalOpen ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-bg-0/70 p-4 backdrop-blur">
          <div className="w-full max-w-[560px] rounded-xl border border-border-0/60 bg-bg-1/80 p-3">
            <div className="mb-2 flex items-start justify-between gap-2">
              <div>
                <div className="text-[13px] font-semibold text-fg-0">Configurar Host</div>
                <div className="text-[11px] text-fg-1">Nome, IP, MAC, Interface, Gateway</div>
              </div>
              <Button variant="ghost" className="h-7 px-2 text-[11px]" onClick={() => setHostModalOpen(false)}>Fechar</Button>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div>
                <div className="mb-1 text-[10px] font-medium text-fg-1">Nome</div>
                <Input value={hostDraft.name} onChange={(e) => setHostDraft((p) => ({ ...p, name: e.target.value }))} placeholder="Host-A" />
              </div>
              <div>
                <div className="mb-1 text-[10px] font-medium text-fg-1">Interface</div>
                <Input value={hostDraft.iface} onChange={(e) => setHostDraft((p) => ({ ...p, iface: e.target.value }))} placeholder="eth0" />
              </div>
              <div>
                <div className="mb-1 text-[10px] font-medium text-fg-1">IP</div>
                <Input value={hostDraft.ip} onChange={(e) => setHostDraft((p) => ({ ...p, ip: e.target.value }))} placeholder="10.0.0.101" />
              </div>
              <div>
                <div className="mb-1 text-[10px] font-medium text-fg-1">Gateway</div>
                <Input value={hostDraft.gateway} onChange={(e) => setHostDraft((p) => ({ ...p, gateway: e.target.value }))} placeholder="10.0.0.1" />
              </div>
              <div className="sm:col-span-2">
                <div className="mb-1 text-[10px] font-medium text-fg-1">MAC</div>
                <Input value={hostDraft.mac} onChange={(e) => setHostDraft((p) => ({ ...p, mac: e.target.value }))} placeholder="aa:bb:cc:dd:ee:ff" />
              </div>
            </div>

            <div className="mt-3 flex items-center justify-end gap-2">
              <Button variant="ghost" onClick={() => setHostModalOpen(false)}>Cancelar</Button>
              <Button variant="primary" onClick={submitHost}>Adicionar Host</Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function TopologyEditor() {
  return (
    <ReactFlowProvider>
      <EditorInner />
    </ReactFlowProvider>
  );
}
