import React, { useEffect, useMemo, useState } from "react";
import PageHeader from "../components/PageHeader";
import Section from "../components/Section";

type TopologyNodeDTO = {
  id: string;
  type: "host" | "switch" | "controller";
};

type TopologyDTO = {
  id: string;
  name: string;
  nodes?: TopologyNodeDTO[];
};

type TrafficPatternDTO = {
  generator: "iperf" | "ping" | "custom";
  src: string;
  dst: string;
  protocol: "tcp" | "udp" | "icmp";
  rate?: string | null;
  duration_sec: number;
  params?: Record<string, string>;
};

type MetricsSetDTO = {
  metrics: string[];
  interval_sec: number;
  labels: string[];
};

type ExperimentDTO = {
  id: string;
  topology_id: string;
  name: string;
  description?: string | null;
  hypotheses?: string | null;
  traffic: TrafficPatternDTO[];
  metrics: MetricsSetDTO;
  duration_sec: number;
  tags: string[];
  template_version?: string | null;
};

type RunDTO = {
  id: string;
  experiment_id: string;
  topology_id: string;
  status: string;
  started_at: string;
  ended_at?: string | null;
  logs?: string[];
};

type MetricDef = {
  name: string;
  description?: string | null;
  unit?: string | null;
  layer?: string | null;
};

type OsiLayerGroup = {
  key: string;
  title: string;
  description: string;
  metrics: MetricDef[];
};

type MetricRecordDTO = {
  timestamp: string;
  metric_name: string;
  value: number;
  layer?: string | null;
  node?: string | null;
  labels?: Record<string, unknown>;
  details?: Record<string, unknown>;
};

type ExperimentTemplate = {
  id: string;
  category: string;
  name: string;
  description: string;
  hypotheses: string;
  tags: string;
  generator: TrafficPatternDTO["generator"];
  protocol: TrafficPatternDTO["protocol"];
  duration_sec: number;
  traffic_duration_sec: number;
  rate: string;
  layers: string[];
  prefer?: string[];
  max_metrics: number;
};

const downloadJson = (filename: string, obj: unknown) => {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

const parseTags = (tags: string) =>
  tags
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

const Experiments: React.FC = () => {
  const apiBase = useMemo(() => {
    const base = import.meta.env.VITE_API_BASE || "http://localhost:8000";
    return String(base).replace(/\/$/, "");
  }, []);

  const apiKey = useMemo(() => import.meta.env.VITE_API_KEY || "", []);
  const authHeaders = useMemo(() => {
    const h: Record<string, string> = { "Content-Type": "application/json" };
    if (apiKey) h["X-API-Key"] = apiKey;
    return h;
  }, [apiKey]);

  const [topologies, setTopologies] = useState<TopologyDTO[]>([]);
  const [experiments, setExperiments] = useState<ExperimentDTO[]>([]);
  const [selectedExpId, setSelectedExpId] = useState<string | null>(null);
  const [runs, setRuns] = useState<RunDTO[]>([]);

  const [metricDefs, setMetricDefs] = useState<MetricDef[]>([]);
  const [metricDefsStatus, setMetricDefsStatus] = useState<"loading" | "ok" | "error">("loading");
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>(["latency_ms", "jitter_ms", "packet_loss_pct"]);
  const [customMetricName, setCustomMetricName] = useState<string>("");

  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [runMetrics, setRunMetrics] = useState<MetricRecordDTO[]>([]);
  const [runMetricsStatus, setRunMetricsStatus] = useState<"idle" | "loading" | "ok" | "error">("idle");

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [uiMode, setUiMode] = useState<"templates" | "manual">("templates");
  const [showHistory, setShowHistory] = useState<boolean>(false);
  const [showMetricsPicker, setShowMetricsPicker] = useState<boolean>(false);
  const [showAdvancedTraffic, setShowAdvancedTraffic] = useState<boolean>(false);

  const [form, setForm] = useState({
    topology_id: "",
    name: "",
    description: "",
    hypotheses: "",
    duration_sec: 30,
    tags: "",
    generator: "ping" as TrafficPatternDTO["generator"],
    protocol: "icmp" as TrafficPatternDTO["protocol"],
    src: "",
    dst: "",
    rate: "",
    traffic_duration_sec: 5,
    params_json: "{}",
    interval_sec: 5,
  });

  const [runMode, setRunMode] = useState<"synthetic" | "real">("synthetic");

  const selected = useMemo(
    () => (selectedExpId ? experiments.find((e) => e.id === selectedExpId) ?? null : null),
    [experiments, selectedExpId]
  );

  const topoName = (id: string) => topologies.find((t) => t.id === id)?.name || id;

  const selectedTopology = useMemo(() => {
    if (!form.topology_id) return null;
    return topologies.find((t) => t.id === form.topology_id) || null;
  }, [form.topology_id, topologies]);

  const hostIds = useMemo(() => {
    const nodes = selectedTopology?.nodes || [];
    return nodes.filter((n) => n.type === "host").map((n) => n.id);
  }, [selectedTopology]);

  const osiGroups = useMemo<OsiLayerGroup[]>(() => {
    const byLayer = new Map<string, MetricDef[]>();
    for (const d of metricDefs) {
      const layer = (d.layer || "unknown").toString() || "unknown";
      if (!byLayer.has(layer)) byLayer.set(layer, []);
      byLayer.get(layer)!.push(d);
    }
    const mk = (key: string, title: string, description: string): OsiLayerGroup => ({
      key,
      title,
      description,
      metrics: (byLayer.get(key) || []).slice().sort((a, b) => a.name.localeCompare(b.name)),
    });
    return [
      mk("service", "L0 — Serviço (E2E)", "Disponibilidade percebida, experiência fim-a-fim, SLIs/SLOs."),
      mk("physical", "L1 — Física", "Interface/PHY: erros, descartes, potência/temperatura quando disponível."),
      mk("link", "L2 — Enlace", "Enlace/filas: utilização, drops, jitter/loss no nível do link."),
      mk("network", "L3 — Rede", "Latência, perda, rotas e reachability (IP/ICMP)."),
      mk("transport", "L4 — Transporte", "TCP/UDP: sockets, retransmissões, throughput, RTT."),
      mk("session", "L5 — Sessão", "Sessões e estados (ex: manutenção/renegociação/keepalive)."),
      mk("presentation", "L6 — Apresentação", "TLS/encoding: handshake, certificados, compressão/serialização."),
      mk("application", "L7 — Aplicação", "HTTP/DNS/app: RPS, latências, erros, disponibilidade de serviços."),
      mk("control", "Plano de Controle (SDN)", "Saúde do controlador, latência control-plane, eventos OpenFlow."),
      mk("dataplane", "Plano de Dados (SDN)", "Counters de flows/tabelas, bytes/packets, pipeline do switch."),
    ].filter((g) => g.metrics.length > 0);
  }, [metricDefs]);

  const selectedMetricsNormalized = useMemo(() => {
    const uniq = new Set<string>();
    for (const m of selectedMetrics) {
      const v = String(m || "").trim();
      if (v) uniq.add(v);
    }
    return Array.from(uniq);
  }, [selectedMetrics]);

  const templates = useMemo<ExperimentTemplate[]>(
    () => [
      {
        id: "baseline-l3-icmp",
        category: "Baseline",
        name: "L3 Baseline — Ping (latência/jitter/perda)",
        description: "Experimento reprodutível ICMP para caracterizar latência, jitter e perda entre dois hosts.",
        hypotheses: "H0: latência/perda estável; H1: degrada sob variação de carga/falhas.",
        tags: "baseline,reprodutivel,icmp,L3",
        generator: "ping",
        protocol: "icmp",
        duration_sec: 30,
        traffic_duration_sec: 10,
        rate: "",
        layers: ["network", "link", "transport"],
        prefer: ["latency_ms", "jitter_ms", "packet_loss_pct"],
        max_metrics: 10,
      },
      {
        id: "baseline-fullstack-dataset",
        category: "Dataset",
        name: "Baseline — Full-stack (L0–L7 + SDN)",
        description: "Coleta ampla para gerar dataset rápido (baseline) cobrindo camadas L0–L7 e planos SDN.",
        hypotheses: "H0: baseline consistente; H1: outliers sob variação de tráfego/topologia.",
        tags: "dataset,baseline,fullstack,L0-L7,SDN",
        generator: "custom",
        protocol: "tcp",
        duration_sec: 60,
        traffic_duration_sec: 10,
        rate: "",
        layers: [
          "service",
          "physical",
          "link",
          "network",
          "transport",
          "session",
          "presentation",
          "application",
          "control",
          "dataplane",
        ],
        prefer: ["e2e_path_availability_pct", "app_availability_pct", "dns_resolution_latency_ms"],
        max_metrics: 35,
      },
      {
        id: "l4-throughput-tcp",
        category: "L4 Transporte",
        name: "L4 — Throughput TCP (iperf)",
        description: "Avalia throughput TCP, estabilidade e sinais de congestionamento sob carga.",
        hypotheses: "H0: throughput estável; H1: queda sob congestionamento/limitação.",
        tags: "throughput,tcp,iperf,L4",
        generator: "iperf",
        protocol: "tcp",
        duration_sec: 60,
        traffic_duration_sec: 30,
        rate: "100Mbps",
        layers: ["transport", "network", "link"],
        prefer: ["throughput_mbps", "tcp_retransmits", "ss_tcp_states", "rtt_ms"],
        max_metrics: 14,
      },
      {
        id: "l4-jitter-udp",
        category: "L4 Transporte",
        name: "L4 — Jitter/Perda UDP (iperf)",
        description: "Stress UDP para observar jitter e perda; útil para VoIP/streaming e redes congestionadas.",
        hypotheses: "H0: jitter baixo; H1: jitter/perda sob saturação/filas.",
        tags: "udp,jitter,loss,iperf,L4",
        generator: "iperf",
        protocol: "udp",
        duration_sec: 60,
        traffic_duration_sec: 30,
        rate: "200Mbps",
        layers: ["transport", "network", "link"],
        prefer: ["jitter_ms", "packet_loss_pct", "throughput_mbps"],
        max_metrics: 14,
      },
      {
        id: "l2-link-utilization",
        category: "L2 Enlace",
        name: "L2 — Utilização/Drops de enlace",
        description: "Coleta típica de enlace/filas: utilização, drops, erros, descartes.",
        hypotheses: "H0: drops ~0; H1: drops sob bursts/congestionamento.",
        tags: "link,queues,drops,L2",
        generator: "custom",
        protocol: "tcp",
        duration_sec: 45,
        traffic_duration_sec: 10,
        rate: "",
        layers: ["link", "physical"],
        prefer: ["link_utilization_pct", "tx_drops", "rx_drops", "tx_errors", "rx_errors"],
        max_metrics: 16,
      },
      {
        id: "l1-phy-errors",
        category: "L1 Física",
        name: "L1 — Erros/descartes físicos",
        description: "Foca em indicadores de PHY/interface (erros, descartes, discards) para estudos de confiabilidade.",
        hypotheses: "H0: erros ~0; H1: aumento de erros sob falha de enlace/hardware.",
        tags: "physical,errors,L1",
        generator: "custom",
        protocol: "tcp",
        duration_sec: 45,
        traffic_duration_sec: 10,
        rate: "",
        layers: ["physical", "link"],
        prefer: ["tx_errors", "rx_errors", "tx_drops", "rx_drops"],
        max_metrics: 14,
      },
      {
        id: "l7-dns-resolution",
        category: "L7 Aplicação",
        name: "L7 — DNS (latência/erros)",
        description: "Perfil para pesquisas de DNS: latência de resolução e disponibilidade do serviço DNS.",
        hypotheses: "H0: resolução rápida; H1: aumento de latência/erros sob perda/congestionamento.",
        tags: "dns,application,L7",
        generator: "custom",
        protocol: "udp",
        duration_sec: 45,
        traffic_duration_sec: 10,
        rate: "",
        layers: ["application", "presentation", "session", "transport"],
        prefer: ["dns_resolution_latency_ms", "dns_success_rate_pct", "app_error_rate_pct"],
        max_metrics: 18,
      },
      {
        id: "l7-http-latency-errors",
        category: "L7 Aplicação",
        name: "L7 — HTTP (latência/erros)",
        description: "Perfil para estudos de APIs/serviços: latência, taxa de erro e disponibilidade em L7.",
        hypotheses: "H0: latência estável e erro baixo; H1: degrada sob carga/congestionamento.",
        tags: "http,latency,errors,L7",
        generator: "custom",
        protocol: "tcp",
        duration_sec: 60,
        traffic_duration_sec: 20,
        rate: "",
        layers: ["application", "presentation", "session", "transport", "service"],
        prefer: ["http_rps", "http_latency_ms", "http_error_rate_pct", "app_availability_pct"],
        max_metrics: 22,
      },
      {
        id: "l6-tls-handshake",
        category: "L6 Apresentação",
        name: "L6 — TLS handshake/certificados",
        description: "Foca em handshake TLS, tempo de negociação e indicadores de certificados (quando disponíveis).",
        hypotheses: "H0: handshake consistente; H1: aumento sob perda/CPU alta.",
        tags: "tls,handshake,L6",
        generator: "custom",
        protocol: "tcp",
        duration_sec: 60,
        traffic_duration_sec: 20,
        rate: "",
        layers: ["presentation", "session", "transport"],
        prefer: ["tls_handshake_latency_ms", "tls_handshake_success_rate_pct"],
        max_metrics: 18,
      },
      {
        id: "l5-session-stability",
        category: "L5 Sessão",
        name: "L5 — Estabilidade de sessão",
        description: "Coleta indicadores de sessão/estado (renegociação, keepalive, tempo de sessão) quando disponíveis.",
        hypotheses: "H0: sessões estáveis; H1: quedas sob falhas/intermitência.",
        tags: "session,keepalive,L5",
        generator: "custom",
        protocol: "tcp",
        duration_sec: 60,
        traffic_duration_sec: 15,
        rate: "",
        layers: ["session", "transport", "application"],
        prefer: ["session_resets", "session_duration_sec"],
        max_metrics: 18,
      },
      {
        id: "l0-sli-slo",
        category: "L0 Serviço",
        name: "L0 — SLI/SLO (disponibilidade E2E)",
        description: "Template para pesquisas de SLI/SLO: disponibilidade E2E, indicadores de serviço e dependências.",
        hypotheses: "H0: disponibilidade próxima de 100%; H1: oscila sob perda/congestionamento.",
        tags: "service,e2e,sli,slo,L0",
        generator: "ping",
        protocol: "icmp",
        duration_sec: 45,
        traffic_duration_sec: 15,
        rate: "",
        layers: ["service", "application", "transport", "network"],
        prefer: ["e2e_path_availability_pct", "app_availability_pct", "dns_resolution_latency_ms"],
        max_metrics: 18,
      },
      {
        id: "sdn-control-health",
        category: "SDN",
        name: "SDN — Saúde do controlador",
        description: "Mede sinais de saúde do controlador e estabilidade de conexão do plano de controle.",
        hypotheses: "H0: controlador saudável; H1: eventos de reconexão/latência sob churn.",
        tags: "sdn,control,controller,openflow",
        generator: "custom",
        protocol: "tcp",
        duration_sec: 45,
        traffic_duration_sec: 10,
        rate: "",
        layers: ["control"],
        prefer: ["controller_conn_ok", "control_plane_latency_ms", "openflow_session_state"],
        max_metrics: 16,
      },
      {
        id: "sdn-dataplane-counters",
        category: "SDN",
        name: "SDN — Contadores do dataplane (flows/bytes/packets)",
        description: "Snapshot de contadores e estado do pipeline do switch (tabelas/flows) para estudos SDN.",
        hypotheses: "H0: contadores consistentes; H1: inconsistências sob mudanças rápidas (flow churn).",
        tags: "sdn,dataplane,openflow,flows",
        generator: "custom",
        protocol: "tcp",
        duration_sec: 30,
        traffic_duration_sec: 10,
        rate: "",
        layers: ["dataplane"],
        prefer: ["openflow_flow_packets", "openflow_flow_bytes", "flow_table_entries"],
        max_metrics: 18,
      },
      {
        id: "sdn-flow-churn",
        category: "SDN",
        name: "SDN — Flow churn (mudança rápida de regras)",
        description: "Template para observar impacto de churn de regras/flows em métricas do dataplane e control-plane.",
        hypotheses: "H0: churn baixo não afeta; H1: churn alto aumenta latência/instabilidade.",
        tags: "sdn,churn,flows,control,dataplane",
        generator: "custom",
        protocol: "tcp",
        duration_sec: 60,
        traffic_duration_sec: 20,
        rate: "",
        layers: ["control", "dataplane", "network", "transport"],
        prefer: ["control_plane_latency_ms", "packet_in_rate", "flow_mod_rate"],
        max_metrics: 26,
      },
      {
        id: "failure-link-flap-observation",
        category: "Falhas",
        name: "Falha — Link flap (observação)",
        description: "Observa impacto de flap de link (provocado externamente) na disponibilidade e métricas L2–L4.",
        hypotheses: "H0: flap detectável via drops; H1: afeta L3/L4 e disponibilidade.",
        tags: "failure,link,flap,L2-L4",
        generator: "ping",
        protocol: "icmp",
        duration_sec: 90,
        traffic_duration_sec: 60,
        rate: "",
        layers: ["link", "network", "transport", "service"],
        prefer: ["packet_loss_pct", "link_utilization_pct", "e2e_path_availability_pct"],
        max_metrics: 22,
      },
      {
        id: "failure-controller-restart-observation",
        category: "Falhas",
        name: "Falha — Restart do controlador (observação)",
        description: "Template para observar comportamento durante restart do controlador (provocado externamente).",
        hypotheses: "H0: recuperação rápida; H1: queda em contadores e disponibilidade.",
        tags: "failure,controller,restart,sdn",
        generator: "custom",
        protocol: "tcp",
        duration_sec: 120,
        traffic_duration_sec: 60,
        rate: "",
        layers: ["control", "dataplane", "service"],
        prefer: ["controller_conn_ok", "control_plane_latency_ms", "e2e_path_availability_pct"],
        max_metrics: 24,
      },
      {
        id: "security-ddos-ish-udp-stress",
        category: "Segurança",
        name: "Segurança — Stress UDP (tipo DDoS, pesquisa)",
        description: "Stress UDP para observar sinais de degradação (loss/drops/latência). Útil em pesquisas defensivas.",
        hypotheses: "H0: rede suporta taxa; H1: perda/drops aumentam e serviço degrada.",
        tags: "security,udp,stress,defensive",
        generator: "iperf",
        protocol: "udp",
        duration_sec: 90,
        traffic_duration_sec: 60,
        rate: "500Mbps",
        layers: ["link", "network", "transport", "service"],
        prefer: ["packet_loss_pct", "rx_drops", "tx_drops", "latency_ms"],
        max_metrics: 24,
      },
      {
        id: "infra-docker-host-health",
        category: "Infra",
        name: "Infra — Saúde de containers/host",
        description: "Template para correlação de saúde de host/containers com métricas de rede e serviço.",
        hypotheses: "H0: recursos estáveis; H1: CPU/mem saturadas degradam latência/throughput.",
        tags: "infra,docker,resources,correlation",
        generator: "custom",
        protocol: "tcp",
        duration_sec: 60,
        traffic_duration_sec: 20,
        rate: "",
        layers: ["physical", "application", "transport", "network"],
        prefer: ["cpu_utilization_pct", "memory_usage_bytes", "throughput_mbps", "latency_ms"],
        max_metrics: 28,
      },
      {
        id: "l3-path-mtu-observation",
        category: "L3 Rede",
        name: "L3 — Path MTU (observação)",
        description: "Observa comportamento de PMTU/fragmentação (quando aplicável) e impacto em latência/perda.",
        hypotheses: "H0: PMTU estável; H1: variação de PMTU aumenta perda/latência.",
        tags: "network,pmtu,fragmentation,L3",
        generator: "ping",
        protocol: "icmp",
        duration_sec: 60,
        traffic_duration_sec: 30,
        rate: "",
        layers: ["network", "transport", "link"],
        prefer: ["path_mtu_bytes", "packet_loss_pct", "latency_ms"],
        max_metrics: 18,
      },
      {
        id: "l3-reachability-flaps",
        category: "L3 Rede",
        name: "L3 — Reachability flaps (observação)",
        description: "Template para capturar flaps/intermitência de reachability entre hosts (útil para estudos de resiliência).",
        hypotheses: "H0: reachability estável; H1: intermitência detectável via spikes de perda/latência.",
        tags: "network,reachability,flap,resilience,L3",
        generator: "ping",
        protocol: "icmp",
        duration_sec: 90,
        traffic_duration_sec: 60,
        rate: "",
        layers: ["network", "service", "link"],
        prefer: ["packet_loss_pct", "e2e_path_availability_pct", "latency_ms"],
        max_metrics: 20,
      },
      {
        id: "l2-arp-nd-dynamics",
        category: "L2 Enlace",
        name: "L2 — ARP/ND dynamics (observação)",
        description: "Foca em dinâmica L2 (ARP/ND, MAC learning) e impacto em disponibilidade/latência (quando métricas existirem).",
        hypotheses: "H0: tabelas estáveis; H1: churn de ARP/ND afeta latência inicial/erros.",
        tags: "link,arp,nd,mac,L2",
        generator: "custom",
        protocol: "tcp",
        duration_sec: 60,
        traffic_duration_sec: 15,
        rate: "",
        layers: ["link", "network", "dataplane"],
        prefer: ["arp_cache_entries", "nd_cache_entries", "mac_table_entries", "packet_loss_pct"],
        max_metrics: 20,
      },
      {
        id: "qos-queue-shaping",
        category: "QoS",
        name: "QoS — Filas/Shaping (observação)",
        description: "Observa métricas de filas (ocupação/drops) e efeitos de shaping/policing (quando configurados externamente).",
        hypotheses: "H0: filas estáveis; H1: shaping/policing aumenta drops/jitter.",
        tags: "qos,queues,shaping,policing",
        generator: "iperf",
        protocol: "udp",
        duration_sec: 90,
        traffic_duration_sec: 60,
        rate: "300Mbps",
        layers: ["link", "network", "transport"],
        prefer: ["queue_occupancy_pct", "tx_drops", "rx_drops", "jitter_ms"],
        max_metrics: 24,
      },
      {
        id: "microbursts-observation",
        category: "Tráfego",
        name: "Tráfego — Microbursts (observação)",
        description: "Template para observar microbursts via sinais de drops/ocupação (quando métricas estiverem disponíveis).",
        hypotheses: "H0: sem microbursts relevantes; H1: bursts elevam drops/latência pontual.",
        tags: "traffic,microbursts,burstiness",
        generator: "iperf",
        protocol: "tcp",
        duration_sec: 90,
        traffic_duration_sec: 45,
        rate: "",
        layers: ["link", "physical", "network"],
        prefer: ["tx_drops", "rx_drops", "link_utilization_pct", "latency_ms"],
        max_metrics: 24,
      },
      {
        id: "l4-connection-churn",
        category: "L4 Transporte",
        name: "L4 — Connection churn (TCP)",
        description: "Observa churn de conexões TCP (aberturas/fechamentos) e sintomas (retransmits/estados).",
        hypotheses: "H0: churn baixo não impacta; H1: churn alto eleva retransmits/latência.",
        tags: "tcp,connections,churn,L4",
        generator: "custom",
        protocol: "tcp",
        duration_sec: 60,
        traffic_duration_sec: 30,
        rate: "",
        layers: ["transport", "session", "network"],
        prefer: ["tcp_conn_attempts", "tcp_conn_failures", "tcp_retransmits", "ss_tcp_states"],
        max_metrics: 22,
      },
      {
        id: "l4-fairness-multi-flow",
        category: "L4 Transporte",
        name: "L4 — Fairness (multi-flows TCP)",
        description: "Template base para discutir fairness de TCP (Jain/variação de throughput) em cenários multi-fluxo.",
        hypotheses: "H0: fairness alta; H1: unfairness sob gargalo/RTT assimétrico.",
        tags: "tcp,fairness,throughput,L4",
        generator: "iperf",
        protocol: "tcp",
        duration_sec: 90,
        traffic_duration_sec: 60,
        rate: "",
        layers: ["transport", "network", "link"],
        prefer: ["throughput_mbps", "tcp_retransmits", "rtt_ms"],
        max_metrics: 22,
      },
      {
        id: "l7-service-dependency-correlation",
        category: "L0/L7",
        name: "Serviço — Dependências (correlação L0↔L7)",
        description: "Template para correlacionar disponibilidade E2E (L0) com erros/latência em L7 e sinais de L3/L4.",
        hypotheses: "H0: L7 explica variação de L0; H1: rede/transporte dominam a degradação.",
        tags: "service,dependencies,correlation,L0,L7",
        generator: "custom",
        protocol: "tcp",
        duration_sec: 90,
        traffic_duration_sec: 30,
        rate: "",
        layers: ["service", "application", "presentation", "transport", "network"],
        prefer: ["e2e_path_availability_pct", "app_error_rate_pct", "http_latency_ms", "latency_ms"],
        max_metrics: 28,
      },
      {
        id: "l7-grpc-like-latency-errors",
        category: "L7 Aplicação",
        name: "L7 — RPC/gRPC-like (latência/erros)",
        description: "Perfil para pesquisas com RPC: latências (p50/p95) e taxa de erro, correlacionando com transporte.",
        hypotheses: "H0: latências estáveis; H1: tail latency cresce sob perda/congestionamento.",
        tags: "rpc,grpc,tail-latency,errors,L7",
        generator: "custom",
        protocol: "tcp",
        duration_sec: 90,
        traffic_duration_sec: 30,
        rate: "",
        layers: ["application", "presentation", "session", "transport"],
        prefer: ["rpc_latency_p95_ms", "rpc_error_rate_pct", "tcp_retransmits", "rtt_ms"],
        max_metrics: 26,
      },
      {
        id: "sdn-multi-controller-failover",
        category: "SDN",
        name: "SDN — Failover multi-controlador (observação)",
        description: "Template para observar efeitos de failover multi-controlador (quando o cenário existir).",
        hypotheses: "H0: failover transparente; H1: eventos de reconexão degradam disponibilidade/latência.",
        tags: "sdn,controller,failover,ha",
        generator: "custom",
        protocol: "tcp",
        duration_sec: 120,
        traffic_duration_sec: 60,
        rate: "",
        layers: ["control", "service", "dataplane"],
        prefer: ["controller_conn_ok", "control_plane_latency_ms", "e2e_path_availability_pct"],
        max_metrics: 28,
      },
      {
        id: "sdn-policy-consistency",
        category: "SDN",
        name: "SDN — Consistência de política (flows/tabelas)",
        description: "Template para discutir consistência de política via estado de flows/tabelas e counters do dataplane.",
        hypotheses: "H0: política consistente; H1: divergências aparecem sob churn/timeout.",
        tags: "sdn,policy,consistency,flows",
        generator: "custom",
        protocol: "tcp",
        duration_sec: 60,
        traffic_duration_sec: 20,
        rate: "",
        layers: ["dataplane", "control"],
        prefer: ["flow_table_entries", "openflow_flow_packets", "openflow_flow_bytes", "flow_mod_rate"],
        max_metrics: 26,
      },
      {
        id: "observability-time-sync",
        category: "Observabilidade",
        name: "Observabilidade — Sincronismo temporal (observação)",
        description: "Template para checar sinais de sincronismo temporal/clock e impactos em métricas (quando disponíveis).",
        hypotheses: "H0: clocks sincronizados; H1: drift afeta correlação e análise de causalidade.",
        tags: "observability,time,sync,ntp,ptp",
        generator: "custom",
        protocol: "tcp",
        duration_sec: 60,
        traffic_duration_sec: 10,
        rate: "",
        layers: ["physical", "service", "application"],
        prefer: ["clock_offset_ms", "ntp_sync_ok", "time_skew_ms"],
        max_metrics: 18,
      },
    ],
    []
  );

  const templatesByCategory = useMemo(() => {
    const groups = new Map<string, ExperimentTemplate[]>();
    for (const t of templates) {
      const cat = String(t.category || "Outros");
      if (!groups.has(cat)) groups.set(cat, []);
      groups.get(cat)!.push(t);
    }
    const cats = Array.from(groups.keys()).sort((a, b) => a.localeCompare(b));
    return cats.map((category) => ({
      category,
      templates: (groups.get(category) || []).slice().sort((a, b) => a.name.localeCompare(b.name)),
    }));
  }, [templates]);

  const resolveTemplateMetrics = (tpl: ExperimentTemplate): string[] => {
    const availableByName = new Set(metricDefs.map((d) => d.name));
    const chosen: string[] = [];
    const add = (name: string) => {
      const v = String(name || "").trim();
      if (!v) return;
      if (!chosen.includes(v)) chosen.push(v);
    };

    for (const p of tpl.prefer || []) {
      if (availableByName.size === 0) add(p);
      else if (availableByName.has(p)) add(p);
    }

    const fromLayers = metricDefs
      .filter((d) => tpl.layers.includes((d.layer || "unknown").toString()))
      .map((d) => d.name)
      .filter(Boolean);

    for (const name of fromLayers) {
      if (chosen.length >= tpl.max_metrics) break;
      add(name);
    }

    if (chosen.length === 0 && metricDefs.length > 0) {
      for (const d of metricDefs.slice(0, Math.min(10, metricDefs.length))) add(d.name);
    }

    return chosen.slice(0, tpl.max_metrics);
  };

  const templateMetricsMap = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const t of templates) m.set(t.id, resolveTemplateMetrics(t));
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templates, metricDefs]);

  const refresh = async () => {
    setError(null);
    const [tResp, eResp] = await Promise.all([
      fetch(`${apiBase}/topologies`),
      fetch(`${apiBase}/experiments`),
    ]);
    const tJson = (await tResp.json()) as TopologyDTO[];
    const eJson = (await eResp.json()) as ExperimentDTO[];
    setTopologies(Array.isArray(tJson) ? tJson : []);
    setExperiments(Array.isArray(eJson) ? eJson : []);
  };

  const refreshMetricDefs = async () => {
    try {
      setMetricDefsStatus("loading");
      const resp = await fetch(`${apiBase}/metrics/definitions`);
      const json = (await resp.json()) as MetricDef[];
      const arr = Array.isArray(json) ? json : [];
      setMetricDefs(arr.filter((d) => d && typeof d === "object" && typeof (d as any).name === "string"));
      setMetricDefsStatus("ok");
    } catch {
      setMetricDefsStatus("error");
    }
  };

  const refreshRuns = async (experimentId: string) => {
    const resp = await fetch(`${apiBase}/experiments/${experimentId}/runs`);
    const json = (await resp.json()) as RunDTO[];
    setRuns(Array.isArray(json) ? json : []);
  };

  useEffect(() => {
    refresh().catch(() => setError("Falha ao carregar topologias/experimentos"));
    refreshMetricDefs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiBase]);

  useEffect(() => {
    if (!form.topology_id && topologies.length === 1) {
      setForm((p) => ({ ...p, topology_id: topologies[0].id }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topologies.length]);

  useEffect(() => {
    if (!selectedExpId) {
      setRuns([]);
      return;
    }
    refreshRuns(selectedExpId).catch(() => setError("Falha ao carregar execuções"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedExpId]);

  useEffect(() => {
    // Auto-pick src/dst from topology hosts when empty
    if (!selectedTopology) return;
    if (hostIds.length >= 2 && (!form.src || !form.dst)) {
      setForm((p) => ({
        ...p,
        src: p.src || hostIds[0],
        dst: p.dst || hostIds[1],
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTopology?.id, hostIds.join(",")]);

  const applyTemplate = (templateId: string) => {
    const tpl = templates.find((t) => t.id === templateId);
    if (!tpl) return;
    const topoId = form.topology_id || topologies[0]?.id || "";
    setForm((prev) => ({
      ...prev,
      topology_id: topoId,
      name: prev.name || `exp-${tpl.id}`,
      description: prev.description || tpl.description,
      hypotheses: prev.hypotheses || tpl.hypotheses,
      duration_sec: tpl.duration_sec,
      tags: prev.tags || tpl.tags,
      generator: tpl.generator,
      protocol: tpl.protocol,
      rate: tpl.rate,
      traffic_duration_sec: tpl.traffic_duration_sec,
    }));
    setSelectedMetrics(templateMetricsMap.get(tpl.id) || []);
  };

  const quickRunTemplate = async (templateId: string) => {
    const tpl = templates.find((t) => t.id === templateId);
    if (!tpl) return;

    const topoId = form.topology_id || topologies[0]?.id || "";
    if (!topoId) {
      setError("Nenhuma topologia disponível para executar o template.");
      return;
    }

    const topo = topologies.find((t) => t.id === topoId) || null;
    const hosts = (topo?.nodes || []).filter((n) => n.type === "host").map((n) => n.id);
    const src = (form.src || hosts[0] || "").trim();
    const dst = (form.dst || hosts[1] || "").trim();
    if (!src || !dst) {
      setError("Este template precisa de src/dst (topologia deve ter pelo menos 2 hosts).");
      return;
    }
    if (src === dst) {
      setError("src e dst devem ser diferentes.");
      return;
    }

    setBusy(`tplrun:${templateId}`);
    setError(null);
    try {
      const metrics = templateMetricsMap.get(tpl.id) || [];
      if (!metrics.length) throw new Error("Template sem métricas resolvidas.");

      const payload = {
        topology_id: topoId,
        name: `exp-${tpl.id}-${new Date().toISOString()}`,
        description: tpl.description || null,
        hypotheses: tpl.hypotheses || null,
        traffic: [
          {
            generator: tpl.generator,
            src,
            dst,
            protocol: tpl.protocol,
            rate: tpl.rate || null,
            duration_sec: Number(tpl.traffic_duration_sec) || 5,
            params: {},
          },
        ],
        metrics: {
          metrics,
          interval_sec: Number(form.interval_sec) || 5,
          labels: ["experiment_id", "run_id", "topology_id"],
        },
        duration_sec: Number(tpl.duration_sec) || 30,
        tags: parseTags(tpl.tags),
      };

      const resp = await fetch(`${apiBase}/experiments`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify(payload),
      });
      if (!resp.ok) {
        const t = await resp.text();
        throw new Error(t || `HTTP ${resp.status}`);
      }
      const created = (await resp.json()) as ExperimentDTO;

      await refresh();
      setSelectedExpId(created.id);
      setRuns([]);

      const runResp = await fetch(`${apiBase}/experiments/${created.id}/run?mode=${encodeURIComponent(runMode)}`, {
        method: "POST",
        headers: authHeaders,
      });
      if (!runResp.ok) {
        const t = await runResp.text();
        throw new Error(t || `HTTP ${runResp.status}`);
      }
      const run = (await runResp.json()) as RunDTO;
      setSelectedRunId(run.id);
      await refreshRuns(created.id);
      await loadRunMetrics(run.id);
      setUiMode("templates");
      setShowHistory(true);
    } catch (e: any) {
      setError(e?.message || "Falha ao executar template");
    } finally {
      setBusy(null);
    }
  };

  const createExperiment = async (): Promise<ExperimentDTO | null> => {
    setBusy("create");
    setError(null);
    try {
      let params: Record<string, string> = {};
      try {
        const parsed = JSON.parse(form.params_json || "{}");
        params = parsed && typeof parsed === "object" ? (parsed as Record<string, string>) : {};
      } catch (_) {
        params = {};
      }

      const payload = {
        topology_id: form.topology_id,
        name: form.name,
        description: form.description || null,
        hypotheses: form.hypotheses || null,
        traffic: [
          {
            generator: form.generator,
            src: form.src,
            dst: form.dst,
            protocol: form.protocol,
            rate: form.rate || null,
            duration_sec: Number(form.traffic_duration_sec) || 5,
            params,
          },
        ],
        metrics: {
          metrics: selectedMetricsNormalized,
          interval_sec: Number(form.interval_sec) || 5,
          labels: ["experiment_id", "run_id", "topology_id"],
        },
        duration_sec: Number(form.duration_sec) || 30,
        tags: parseTags(form.tags),
      };

      const resp = await fetch(`${apiBase}/experiments`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify(payload),
      });

      if (!resp.ok) {
        const t = await resp.text();
        throw new Error(t || `HTTP ${resp.status}`);
      }

      const created = (await resp.json()) as ExperimentDTO;
      await refresh();
      setSelectedExpId(created.id);
      setRuns([]);
      return created;
    } catch (e: any) {
      setError(e?.message || "Falha ao criar experimento");
      return null;
    } finally {
      setBusy(null);
    }
  };

  const runExperiment = async (experimentId: string) => {
    setBusy(`run:${experimentId}`);
    setError(null);
    try {
      const resp = await fetch(`${apiBase}/experiments/${experimentId}/run?mode=${encodeURIComponent(runMode)}`, {
        method: "POST",
        headers: authHeaders,
      });
      if (!resp.ok) {
        const t = await resp.text();
        throw new Error(t || `HTTP ${resp.status}`);
      }
      const run = (await resp.json()) as RunDTO;
      setSelectedExpId(experimentId);
      await refreshRuns(experimentId);
      setSelectedRunId(run.id);
      await loadRunMetrics(run.id);
      setShowHistory(true);
    } catch (e: any) {
      setError(e?.message || "Falha ao iniciar execução");
    } finally {
      setBusy(null);
    }
  };

  const createAndRun = async () => {
    const created = await createExperiment();
    if (created?.id) {
      await runExperiment(created.id);
      setShowHistory(true);
    }
  };

  const exportExperiment = (experimentId: string) => {
    const exp = experiments.find((e) => e.id === experimentId);
    if (!exp) return;
    downloadJson(`experiment_${experimentId}.json`, exp);
  };

  const exportRunMetrics = async (runId: string) => {
    setBusy(`metrics:${runId}`);
    setError(null);
    try {
      const resp = await fetch(`${apiBase}/runs/${runId}/metrics`);
      if (!resp.ok) {
        const t = await resp.text();
        throw new Error(t || `HTTP ${resp.status}`);
      }
      const json = await resp.json();
      downloadJson(`run_${runId}_metrics.json`, json);
    } catch (e: any) {
      setError(e?.message || "Falha ao exportar métricas da execução");
    } finally {
      setBusy(null);
    }
  };

  const loadRunMetrics = async (runId: string) => {
    setRunMetricsStatus("loading");
    setError(null);
    try {
      const resp = await fetch(`${apiBase}/runs/${runId}/metrics`);
      if (!resp.ok) {
        const t = await resp.text();
        throw new Error(t || `HTTP ${resp.status}`);
      }
      const json = (await resp.json()) as MetricRecordDTO[];
      const arr = Array.isArray(json) ? json : [];
      setRunMetrics(arr);
      setRunMetricsStatus("ok");
    } catch (e: any) {
      setRunMetrics([]);
      setRunMetricsStatus("error");
      setError(e?.message || "Falha ao carregar métricas da execução");
    }
  };

  const deleteExperiment = async (experimentId: string) => {
    setBusy(`delete:${experimentId}`);
    setError(null);
    try {
      const resp = await fetch(`${apiBase}/experiments/${experimentId}`, { method: "DELETE" });
      if (!resp.ok) {
        const t = await resp.text();
        throw new Error(t || `HTTP ${resp.status}`);
      }
      if (selectedExpId === experimentId) setSelectedExpId(null);
      await refresh();
    } catch (e: any) {
      setError(e?.message || "Falha ao excluir experimento");
    } finally {
      setBusy(null);
    }
  };

  const validationError = useMemo(() => {
    if (!form.topology_id) return "Selecione uma topologia.";
    if (!form.name.trim()) return "Nome do experimento é obrigatório.";
    if (!form.src.trim() || !form.dst.trim()) return "Selecione src e dst.";
    if (form.src.trim() === form.dst.trim()) return "src e dst devem ser diferentes.";
    if (!selectedMetricsNormalized.length) return "Selecione pelo menos 1 métrica.";
    return "";
  }, [form.dst, form.name, form.src, form.topology_id, selectedMetricsNormalized.length]);

  return (
    <div className="page">
      <PageHeader title="Experimentos" subtitle="Registro científico (experimentos, execuções e artefatos)" />

      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ fontWeight: 700 }}>Fluxo rápido</div>
        <div className="muted" style={{ marginTop: 6 }}>
          Templates = 1 clique (<strong>Usar + executar</strong>). Manual = para casos muito específicos.
        </div>
        <div className="chip-row" style={{ marginTop: 10 }}>
          <button className="btn" type="button" onClick={() => setUiMode("templates")} disabled={busy !== null || uiMode === "templates"}>
            Templates (1 clique)
          </button>
          <button className="btn" type="button" onClick={() => setUiMode("manual")} disabled={busy !== null || uiMode === "manual"}>
            Manual
          </button>
          <button className="btn" type="button" onClick={() => setShowHistory((v) => !v)} disabled={busy !== null}>
            {showHistory ? "Ocultar histórico" : "Ver histórico/resultados"}
          </button>
          {error ? <span className="muted">{error}</span> : null}
        </div>
        {!apiKey ? (
          <div className="muted" style={{ marginTop: 10 }}>
            Observação: criar/rodar experimento requer `VITE_API_KEY` (backend protegido). Sem isso, as ações vão falhar com 401.
          </div>
        ) : null}
      </div>
      {uiMode === "templates" ? (
        <Section
          title="Biblioteca de experimentos (templates)"
          description="Escolha um template pronto e execute em 1 clique. Ele já vem com tráfego e métricas por camada (L0–L7)."
        >
          <div className="card">
            <div className="muted" style={{ marginBottom: 10 }}>
              Dica: o resultado aparece em <strong>Histórico/Resultados</strong> automaticamente após executar.
            </div>
            {templatesByCategory.map((g) => (
              <div key={g.category} style={{ marginTop: 14 }}>
                <div style={{ fontWeight: 700, marginBottom: 8 }}>
                  {g.category} <span className="muted">({g.templates.length})</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
                  {g.templates.map((t) => (
                    <div key={t.id} style={{ border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: 12 }}>
                      <div style={{ fontWeight: 700 }}>{t.name}</div>
                      <div className="muted" style={{ marginTop: 6 }}>
                        {t.description}
                      </div>
                      <div className="muted" style={{ marginTop: 10 }}>
                        Métricas sugeridas: {(templateMetricsMap.get(t.id) || []).slice(0, 6).join(", ")}
                        {(templateMetricsMap.get(t.id) || []).length > 6 ? "…" : ""}
                      </div>
                      <div className="chip-row" style={{ marginTop: 12 }}>
                        <button className="btn" type="button" onClick={() => applyTemplate(t.id)} disabled={busy !== null}>
                          Usar template
                        </button>
                        <button
                          className="btn"
                          type="button"
                          onClick={() => void quickRunTemplate(t.id)}
                          disabled={busy !== null || !apiKey}
                          title={!apiKey ? "Requer VITE_API_KEY para criar/rodar" : ""}
                        >
                          Usar + executar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Section>
      ) : null}

      {uiMode === "manual" ? (
      <Section
        title="Criar experimento (manual)"
        description="Use quando precisar de algo fora dos templates. O resultado aparece em Histórico/Resultados após executar."
      >
        <div className="card">

          <div className="subgrid">
            <div className="field">
              <label>Topologia *</label>
              <select
                value={form.topology_id}
                onChange={(e) => setForm((p) => ({ ...p, topology_id: e.target.value }))}
              >
                <option value="">Selecione…</option>
                {topologies.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.id})
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label>Nome *</label>
              <input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
            </div>

            <div className="field" style={{ gridColumn: "1 / -1" }}>
              <label>Descrição (opcional)</label>
              <textarea
                rows={2}
                value={form.description}
                onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
              />
            </div>

            <div className="field" style={{ gridColumn: "1 / -1" }}>
              <label>Hipótese (opcional)</label>
              <textarea
                rows={2}
                value={form.hypotheses}
                onChange={(e) => setForm((p) => ({ ...p, hypotheses: e.target.value }))}
              />
            </div>
          </div>

          <div className="subgrid" style={{ marginTop: 12 }}>
            <div className="field">
              <label>Duração (s)</label>
              <input
                type="number"
                value={form.duration_sec}
                onChange={(e) => setForm((p) => ({ ...p, duration_sec: Number(e.target.value) }))}
              />
            </div>

            <div className="field">
              <label>Tags (separadas por vírgula)</label>
              <input value={form.tags} onChange={(e) => setForm((p) => ({ ...p, tags: e.target.value }))} />
            </div>

            <div className="field">
              <label>Métricas * (seleção)</label>
              <div className="muted">Selecionadas: {selectedMetricsNormalized.length}</div>
            </div>

            <div className="field">
              <label>Intervalo (s)</label>
              <input
                type="number"
                value={form.interval_sec}
                onChange={(e) => setForm((p) => ({ ...p, interval_sec: Number(e.target.value) }))}
              />
            </div>
          </div>

          <div className="subgrid" style={{ marginTop: 12 }}>
            <div className="field">
              <label>Tráfego: gerador</label>
              <select
                value={form.generator}
                onChange={(e) => setForm((p) => ({ ...p, generator: e.target.value as any }))}
              >
                <option value="ping">ping</option>
                <option value="iperf">iperf</option>
                <option value="custom">custom</option>
              </select>
            </div>
            <div className="field">
              <label>Protocolo</label>
              <select
                value={form.protocol}
                onChange={(e) => setForm((p) => ({ ...p, protocol: e.target.value as any }))}
              >
                <option value="icmp">icmp</option>
                <option value="tcp">tcp</option>
                <option value="udp">udp</option>
              </select>
            </div>
            <div className="field">
              <label>Src *</label>
              {hostIds.length ? (
                <select value={form.src} onChange={(e) => setForm((p) => ({ ...p, src: e.target.value }))}>
                  <option value="">Selecione…</option>
                  {hostIds.map((id) => (
                    <option key={id} value={id}>
                      {id}
                    </option>
                  ))}
                </select>
              ) : (
                <input value={form.src} onChange={(e) => setForm((p) => ({ ...p, src: e.target.value }))} placeholder="ex: h1" />
              )}
            </div>
            <div className="field">
              <label>Dst *</label>
              {hostIds.length ? (
                <select value={form.dst} onChange={(e) => setForm((p) => ({ ...p, dst: e.target.value }))}>
                  <option value="">Selecione…</option>
                  {hostIds.map((id) => (
                    <option key={id} value={id}>
                      {id}
                    </option>
                  ))}
                </select>
              ) : (
                <input value={form.dst} onChange={(e) => setForm((p) => ({ ...p, dst: e.target.value }))} placeholder="ex: h2" />
              )}
            </div>
            <div className="field">
              <label>Taxa (opcional)</label>
              <input value={form.rate} onChange={(e) => setForm((p) => ({ ...p, rate: e.target.value }))} />
            </div>
            <div className="field">
              <label>Duração tráfego (s)</label>
              <input
                type="number"
                value={form.traffic_duration_sec}
                onChange={(e) => setForm((p) => ({ ...p, traffic_duration_sec: Number(e.target.value) }))}
              />
            </div>
            <div className="field" style={{ gridColumn: "1 / -1" }}>
              <div className="chip-row" style={{ alignItems: "center" }}>
                <button className="btn" type="button" onClick={() => setShowAdvancedTraffic((v) => !v)}>
                  {showAdvancedTraffic ? "Ocultar avançado" : "Mostrar avançado"}
                </button>
                <div className="muted">params (JSON) — raramente necessário</div>
              </div>
              {showAdvancedTraffic ? (
                <>
                  <label style={{ marginTop: 10 }}>params (JSON)</label>
                  <textarea
                    rows={3}
                    value={form.params_json}
                    onChange={(e) => setForm((p) => ({ ...p, params_json: e.target.value }))}
                  />
                  <div className="muted">Ex.: {`{"count":"10"}`}</div>
                </>
              ) : null}
            </div>
          </div>

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", marginTop: 12 }}>
            <div className="muted">Modo de execução:</div>
            <select value={runMode} onChange={(e) => setRunMode(e.target.value as any)}>
              <option value="synthetic">synthetic (sempre disponível)</option>
              <option value="real">real (usa docker exec/ping/ovs-ofctl)</option>
            </select>
          </div>

          <div style={{ marginTop: 12 }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Seleção de métricas por camadas (L0–L7)</div>
            <div className="muted" style={{ marginBottom: 10 }}>
              {metricDefsStatus === "loading" ? "Carregando catálogo…" : metricDefsStatus === "error" ? "Falha ao carregar catálogo." : ""}
            </div>

            <div className="chip-row" style={{ marginBottom: 10 }}>
              <button className="btn" type="button" onClick={() => setShowMetricsPicker((v) => !v)}>
                {showMetricsPicker ? "Fechar seleção" : "Editar métricas"}
              </button>
              <button className="btn" type="button" onClick={() => setSelectedMetrics([])} disabled={busy !== null}>
                Limpar
              </button>
              <div className="muted">Selecionadas: {selectedMetricsNormalized.length}</div>
            </div>

            {!showMetricsPicker ? (
              <div className="card" style={{ marginTop: 8 }}>
                <div className="muted">Métricas selecionadas</div>
                <div className="mono" style={{ marginTop: 6, wordBreak: "break-word" }}>
                  {selectedMetricsNormalized.length ? selectedMetricsNormalized.join(", ") : "(nenhuma)"}
                </div>
              </div>
            ) : (
              <>

                <div className="chip-row" style={{ marginBottom: 10 }}>
                  <input
                    value={customMetricName}
                    onChange={(e) => setCustomMetricName(e.target.value)}
                    placeholder="Adicionar métrica custom (ex: my_metric)"
                    style={{ minWidth: 320 }}
                  />
                  <button
                    className="btn"
                    type="button"
                    onClick={() => {
                      const v = customMetricName.trim();
                      if (!v) return;
                      setSelectedMetrics((prev) => (prev.includes(v) ? prev : [...prev, v]));
                      setCustomMetricName("");
                    }}
                  >
                    Adicionar
                  </button>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 12 }}>
                  {osiGroups.map((g) => (
                    <div key={g.key} style={{ border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: 12 }}>
                      <div style={{ fontWeight: 700 }}>{g.title}</div>
                      <div className="muted" style={{ marginTop: 6, marginBottom: 10 }}>
                        {g.description}
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 6, maxHeight: 240, overflow: "auto" }}>
                        {g.metrics.map((d) => {
                          const checked = selectedMetricsNormalized.includes(d.name);
                          const title = d.description
                            ? `${d.description}${d.unit ? ` (${d.unit})` : ""}`
                            : d.unit
                              ? `(${d.unit})`
                              : "";
                          return (
                            <label key={d.name} style={{ display: "flex", gap: 8, alignItems: "center" }} title={title}>
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(e) => {
                                  const next = e.target.checked;
                                  setSelectedMetrics((prev) => {
                                    if (next) return prev.includes(d.name) ? prev : [...prev, d.name];
                                    return prev.filter((m) => m !== d.name);
                                  });
                                }}
                              />
                              <span className="muted" style={{ wordBreak: "break-word" }}>
                                {d.name}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="chip-row" style={{ marginTop: 12 }}>
            <button
              className="btn"
              onClick={() => void createExperiment()}
              disabled={busy !== null || Boolean(validationError)}
              title={validationError || ""}
            >
              {busy === "create" ? "Criando…" : "Criar experimento"}
            </button>
            <button
              className="btn"
              onClick={createAndRun}
              disabled={busy !== null || Boolean(validationError)}
              title={validationError || ""}
            >
              {busy === "create" || busy?.startsWith("run:") ? "Executando…" : "Criar e executar (snapshot)"}
            </button>
            <button className="btn" onClick={() => refresh()} disabled={busy !== null}>
              Atualizar
            </button>
          </div>
        </div>
      </Section>

      ) : null}

      {showHistory ? (
      <>
      <Section title="Registro de experimentos" description="Selecione um experimento para ver execuções e exportar artefatos.">
        <div className="card table-card">
          <table>
            <thead>
              <tr>
                <th>Nome</th>
                <th>Topologia</th>
                <th>Duração</th>
                <th>Tags</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {experiments.length === 0 ? (
                <tr>
                  <td colSpan={5} className="muted">
                    Nenhum experimento ainda.
                  </td>
                </tr>
              ) : (
                experiments.map((e) => (
                  <tr key={e.id} style={selectedExpId === e.id ? { background: "rgba(56, 189, 248, 0.06)" } : undefined}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{e.name}</div>
                      <div className="muted mono">{e.id}</div>
                    </td>
                    <td>
                      <div>{topoName(e.topology_id)}</div>
                      <div className="muted mono">{e.topology_id}</div>
                    </td>
                    <td>{e.duration_sec}s</td>
                    <td>
                      <div className="muted">{(e.tags || []).join(", ") || "-"}</div>
                    </td>
                    <td>
                      <div className="chip-row">
                        <button className="btn" onClick={() => setSelectedExpId(e.id)} disabled={busy !== null}>
                          Selecionar
                        </button>
                        <button
                          className="btn"
                          onClick={() => runExperiment(e.id)}
                          disabled={busy !== null}
                          title="Executa uma coleta snapshot e salva os artefatos"
                        >
                          {busy === `run:${e.id}` ? "Rodando…" : "Rodar (snapshot)"}
                        </button>
                        <button className="btn" onClick={() => exportExperiment(e.id)} disabled={busy !== null}>
                          Exportar JSON
                        </button>
                        <button
                          className="btn"
                          onClick={() => deleteExperiment(e.id)}
                          disabled={busy !== null}
                          title="Remove o experimento e execuções associadas"
                        >
                          {busy === `delete:${e.id}` ? "Excluindo…" : "Excluir"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Detalhes e execuções" description={selected ? `Topologia: ${topoName(selected.topology_id)}` : "Selecione um experimento acima."}>
        <div className="card">
          {!selected ? (
            <div className="muted">Nenhum experimento selecionado.</div>
          ) : (
            <>
              <div className="subgrid">
                <div>
                  <div style={{ fontWeight: 700 }}>{selected.name}</div>
                  <div className="muted mono">{selected.id}</div>
                </div>
                <div>
                  <div className="muted">Hipótese</div>
                  <div>{selected.hypotheses || "-"}</div>
                </div>
              </div>

              <div className="chip-row" style={{ marginTop: 12 }}>
                <button className="btn" onClick={() => exportExperiment(selected.id)} disabled={busy !== null}>
                  Exportar experimento
                </button>
                <button className="btn" onClick={() => runExperiment(selected.id)} disabled={busy !== null}>
                  {busy === `run:${selected.id}` ? "Rodando…" : "Rodar (snapshot)"}
                </button>
                <button className="btn" onClick={() => refreshRuns(selected.id)} disabled={busy !== null}>
                  Atualizar execuções
                </button>
              </div>

              <div className="card table-card" style={{ marginTop: 12 }}>
                <table>
                  <thead>
                    <tr>
                      <th>Run</th>
                      <th>Status</th>
                      <th>Início</th>
                      <th>Fim</th>
                      <th>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {runs.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="muted">
                          Nenhuma execução ainda.
                        </td>
                      </tr>
                    ) : (
                      runs
                        .slice()
                        .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime())
                        .map((r) => (
                          <tr key={r.id}>
                            <td className="mono">{r.id}</td>
                            <td>{r.status}</td>
                            <td className="mono">{r.started_at}</td>
                            <td className="mono">{r.ended_at || "-"}</td>
                            <td>
                              <div className="chip-row">
                                <button
                                  className="btn"
                                  onClick={() => {
                                    setSelectedRunId(r.id);
                                    loadRunMetrics(r.id);
                                  }}
                                  disabled={busy !== null}
                                  title="Carrega métricas desta execução para visualizar na tela"
                                >
                                  Ver resultado
                                </button>
                                <button
                                  className="btn"
                                  onClick={() => downloadJson(`run_${r.id}.json`, r)}
                                  disabled={busy !== null}
                                >
                                  Exportar run
                                </button>
                                <button
                                  className="btn"
                                  onClick={() => exportRunMetrics(r.id)}
                                  disabled={busy !== null}
                                >
                                  {busy === `metrics:${r.id}` ? "Baixando…" : "Baixar métricas"}
                                </button>
                              </div>
                              {Array.isArray(r.logs) && r.logs.length ? (
                                <div className="muted" style={{ marginTop: 6 }}>
                                  Log: {r.logs.slice(-2).join(" | ")}
                                </div>
                              ) : null}
                            </td>
                          </tr>
                        ))
                    )}
                  </tbody>
                </table>
              </div>

              <div className="card" style={{ marginTop: 12 }}>
                <div style={{ fontWeight: 700 }}>Resultado (execução)</div>
                <div className="muted">{selectedRunId ? `Run: ${selectedRunId}` : "Selecione uma execução em 'Ver resultado'."}</div>

                {selectedRunId ? (
                  <>
                    <div className="chip-row" style={{ marginTop: 10 }}>
                      <button
                        className="btn"
                        type="button"
                        onClick={() => loadRunMetrics(selectedRunId)}
                        disabled={runMetricsStatus === "loading"}
                      >
                        {runMetricsStatus === "loading" ? "Carregando…" : "Atualizar resultado"}
                      </button>
                      <button className="btn" type="button" onClick={() => exportRunMetrics(selectedRunId)} disabled={busy !== null}>
                        Baixar métricas (JSON)
                      </button>
                    </div>

                    <div className="muted" style={{ marginTop: 10 }}>
                      {runMetricsStatus === "error" ? "Falha ao carregar métricas." : runMetricsStatus === "ok" ? `Registros: ${runMetrics.length}` : ""}
                    </div>

                    {runMetrics.length ? (
                      <div className="card table-card" style={{ marginTop: 10 }}>
                        <table>
                          <thead>
                            <tr>
                              <th>Timestamp</th>
                              <th>Layer</th>
                              <th>Node</th>
                              <th>Métrica</th>
                              <th>Valor</th>
                            </tr>
                          </thead>
                          <tbody>
                            {runMetrics
                              .slice()
                              .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
                              .slice(0, 50)
                              .map((m, idx) => (
                                <tr key={`${m.timestamp}-${m.metric_name}-${idx}`}>
                                  <td className="mono">{m.timestamp}</td>
                                  <td>{m.layer || "-"}</td>
                                  <td className="mono">{m.node || "-"}</td>
                                  <td className="mono">{m.metric_name}</td>
                                  <td>{Number.isFinite(m.value) ? m.value : "-"}</td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                        <div className="muted" style={{ marginTop: 8 }}>
                          Mostrando os 50 registros mais recentes.
                        </div>
                      </div>
                    ) : null}
                  </>
                ) : null}
              </div>
            </>
          )}
        </div>
      </Section>
      </>
      ) : null}
    </div>
  );
};

export default Experiments;
