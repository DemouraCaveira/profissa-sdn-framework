import React, { useEffect, useMemo, useState } from "react";
import PageHeader from "../components/PageHeader";
import Section from "../components/Section";

type ConfigListItem = {
  id: string;
  name: string;
  active: boolean;
  updated_at?: string | null;
};

type SavedConfig = {
  id?: string;
  name?: string;
  description?: string;
  environment?: string;
  updated_at?: string;
  config: Record<string, unknown>;
};

type EnvMode = "docker" | "local";

type ControllerType = "ryu" | "onos" | "odl" | "floodlight";

type NodeRole = "controller" | "switch" | "host";

type NodeForm = {
  id: string;
  role: NodeRole;
  mgmt_ip: string;
  image: string;
  container_name: string;
  ssh_user: string;
  ssh_port: number;
  bridge: string;
  datapath_id: string;
  ofctl_host: string;
  ofctl_port: number;
};

type LinkForm = {
  source: string;
  target: string;
  bandwidth_mbps: number;
  delay_ms: number;
  loss_pct: number;
};

type MetricDef = {
  name: string;
  description?: string | null;
  unit?: string | null;
  layer?: string | null;
};

const prettyJson = (obj: unknown) => {
  try {
    return JSON.stringify(obj, null, 2);
  } catch {
    return "{}";
  }
};

const req = (label: string) => (
  <span>
    {label} <span title="Obrigatório">*</span>
  </span>
);

const safeString = (v: unknown) => (typeof v === "string" ? v : "");
const safeNumber = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);
const safeBool = (v: unknown, fallback: boolean) => (typeof v === "boolean" ? v : fallback);

const defaultNode = (role: NodeRole): NodeForm => ({
  id: "",
  role,
  mgmt_ip: "",
  image: "",
  container_name: "",
  ssh_user: "root",
  ssh_port: 22,
  bridge: "",
  datapath_id: "",
  ofctl_host: "",
  ofctl_port: 6640,
});

const defaultLink = (): LinkForm => ({
  source: "",
  target: "",
  bandwidth_mbps: 1000,
  delay_ms: 1,
  loss_pct: 0,
});

const Settings: React.FC = () => {
  const apiBase = useMemo(() => import.meta.env.VITE_API_BASE || "/api", []);
  const apiKey = useMemo(() => import.meta.env.VITE_API_KEY || "", []);

  const [items, setItems] = useState<ConfigListItem[]>([]);
  const [listStatus, setListStatus] = useState<"loading" | "ok" | "error">("loading");

  const [selectedId, setSelectedId] = useState<string>("lft-profissa");
  const [loaded, setLoaded] = useState<SavedConfig | null>(null);
  const [name, setName] = useState<string>("lft-profissa");
  const [description, setDescription] = useState<string>("");
  const [baseConfig, setBaseConfig] = useState<Record<string, unknown>>({});

  // Guided form fields
  const [envMode, setEnvMode] = useState<EnvMode>("docker");
  const [dockerNetwork, setDockerNetwork] = useState<string>("sdn_lab_net");
  const [sshKeyPath, setSshKeyPath] = useState<string>("~/.ssh/id_rsa");

  const [controllerEnabled, setControllerEnabled] = useState<boolean>(true);
  const [controllerId, setControllerId] = useState<string>("ctrl-ryu");
  const [controllerType, setControllerType] = useState<ControllerType>("ryu");
  const [controllerApiBaseUrl, setControllerApiBaseUrl] = useState<string>("http://127.0.0.1:8080");
  const [openflowHost, setOpenflowHost] = useState<string>("127.0.0.1");
  const [openflowPort, setOpenflowPort] = useState<number>(6633);

  const [nodes, setNodes] = useState<NodeForm[]>([defaultNode("controller"), defaultNode("switch"), defaultNode("host")]);
  const [links, setLinks] = useState<LinkForm[]>([defaultLink()]);

  const [layerService, setLayerService] = useState<boolean>(true);
  const [layerPhysical, setLayerPhysical] = useState<boolean>(true);
  const [layerLink, setLayerLink] = useState<boolean>(true);
  const [layerNetwork, setLayerNetwork] = useState<boolean>(true);
  const [layerTransport, setLayerTransport] = useState<boolean>(true);
  const [layerSession, setLayerSession] = useState<boolean>(true);
  const [layerPresentation, setLayerPresentation] = useState<boolean>(true);
  const [layerApplication, setLayerApplication] = useState<boolean>(true);
  const [layerControl, setLayerControl] = useState<boolean>(true);
  const [layerDataplane, setLayerDataplane] = useState<boolean>(true);

  const [planEnabled, setPlanEnabled] = useState<boolean>(true);
  const [planIntervalSec, setPlanIntervalSec] = useState<number>(5);
  const [planLabelsText, setPlanLabelsText] = useState<string>("experiment_id,run_id,topology_id,src,dst");
  const [planDefaultLayer, setPlanDefaultLayer] = useState<string>("network");

  const [metricDefs, setMetricDefs] = useState<MetricDef[]>([]);
  const [metricDefsStatus, setMetricDefsStatus] = useState<"loading" | "ok" | "error">("loading");
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>(["latency_ms", "packet_loss_pct", "throughput_mbps"]);
  const [customMetricName, setCustomMetricName] = useState<string>("");

  const [saving, setSaving] = useState<boolean>(false);
  const [message, setMessage] = useState<string>("");

  const headers = useMemo(() => {
    const h: Record<string, string> = { "Content-Type": "application/json" };
    if (apiKey) h["X-API-Key"] = apiKey;
    return h;
  }, [apiKey]);

  const refreshList = async () => {
    try {
      setListStatus("loading");
      const resp = await fetch(`${apiBase.replace(/\/$/, "")}/configs`);
      const json = (await resp.json()) as ConfigListItem[];
      const arr = Array.isArray(json) ? json : [];
      setItems(arr);
      const active = arr.find((c) => c.active);
      if (active) setSelectedId(active.id);
      setListStatus("ok");
    } catch {
      setListStatus("error");
    }
  };

  const loadMetricDefinitions = async () => {
    try {
      setMetricDefsStatus("loading");
      const resp = await fetch(`${apiBase.replace(/\/$/, "")}/metrics/definitions`);
      const json = (await resp.json()) as MetricDef[];
      const arr = Array.isArray(json) ? json : [];
      setMetricDefs(arr.filter((d) => d && typeof d === "object" && typeof (d as any).name === "string"));
      setMetricDefsStatus("ok");
    } catch {
      setMetricDefsStatus("error");
    }
  };

  const loadConfig = async (id: string) => {
    try {
      setMessage("");
      const resp = await fetch(`${apiBase.replace(/\/$/, "")}/configs/${encodeURIComponent(id)}`);
      const json = (await resp.json()) as SavedConfig;
      if (json && typeof json === "object") {
        setLoaded(json);
        setName(String(json.name || id));
        setDescription(String(json.description || ""));
        const cfg = (json.config && typeof json.config === "object" ? json.config : {}) as Record<string, unknown>;
        setBaseConfig(cfg);

        // Populate form from config (best-effort).
        const env = (cfg.environment && typeof cfg.environment === "object" ? (cfg.environment as Record<string, unknown>) : {}) as Record<string, unknown>;
        const mode = safeString(env.mode) as EnvMode;
        setEnvMode(mode === "local" ? "local" : "docker");
        setDockerNetwork(safeString(env.docker_network) || "sdn_lab_net");
        // Key in sample config: environment.ssh_key_path
        setSshKeyPath(safeString(env["ssh_key_path"]) || "~/.ssh/id_rsa");

        const ctrls = Array.isArray(cfg.controllers) ? (cfg.controllers as any[]) : [];
        const first = ctrls.length ? (ctrls[0] as Record<string, unknown>) : null;
        setControllerEnabled(Boolean(first));
        if (first) {
          setControllerId(safeString(first.id) || "ctrl-ryu");
          const ct = safeString(first.type) as ControllerType;
          setControllerType((ct as any) || "ryu");
          setControllerApiBaseUrl(safeString(first.api_base_url) || "http://127.0.0.1:8080");
          const of = (first.openflow && typeof first.openflow === "object" ? (first.openflow as Record<string, unknown>) : {}) as Record<string, unknown>;
          setOpenflowHost(safeString(of.host) || "127.0.0.1");
          setOpenflowPort(safeNumber(of.port, 6633));
        }

        const nodesCfg = Array.isArray(cfg.nodes) ? (cfg.nodes as any[]) : [];
        if (nodesCfg.length) {
          setNodes(
            nodesCfg
              .filter((n) => n && typeof n === "object")
              .map((n) => {
                const obj = n as Record<string, unknown>;
                const role = (safeString(obj.role || obj.type) as NodeRole) || "host";
                const meta = (obj.meta && typeof obj.meta === "object" ? (obj.meta as Record<string, unknown>) : {}) as Record<string, unknown>;
                const ofctl = (obj.ofctl && typeof obj.ofctl === "object" ? (obj.ofctl as Record<string, unknown>) : {}) as Record<string, unknown>;
                return {
                  id: safeString(obj.id),
                  role: role === "controller" || role === "switch" || role === "host" ? role : "host",
                  mgmt_ip: safeString(obj.mgmt_ip),
                  image: safeString(obj.image),
                  container_name: safeString(obj.container_name),
                  ssh_user: safeString(meta.ssh_user) || "root",
                  ssh_port: safeNumber(meta.ssh_port, 22),
                  bridge: safeString(obj.bridge),
                  datapath_id: safeString(obj.datapath_id),
                  ofctl_host: safeString(ofctl.host),
                  ofctl_port: safeNumber(ofctl.port, 6640),
                } as NodeForm;
              })
          );
        }

        const linksCfg = Array.isArray(cfg.links) ? (cfg.links as any[]) : [];
        if (linksCfg.length) {
          setLinks(
            linksCfg
              .filter((l) => l && typeof l === "object")
              .map((l) => {
                const obj = l as Record<string, unknown>;
                return {
                  source: safeString(obj.source),
                  target: safeString(obj.target),
                  bandwidth_mbps: safeNumber(obj.bandwidth_mbps, 1000),
                  delay_ms: safeNumber(obj.delay_ms, 1),
                  loss_pct: safeNumber(obj.loss_pct, 0),
                } as LinkForm;
              })
          );
        }

        const layers = (cfg.metric_layers && typeof cfg.metric_layers === "object" ? (cfg.metric_layers as Record<string, unknown>) : {}) as Record<string, unknown>;
        setLayerService(safeBool(layers.service, true));
        setLayerPhysical(safeBool(layers.physical, true));
        setLayerLink(safeBool(layers.link, true));
        setLayerNetwork(safeBool(layers.network, true));
        setLayerTransport(safeBool(layers.transport, true));
        setLayerSession(safeBool(layers.session, true));
        setLayerPresentation(safeBool(layers.presentation, true));
        setLayerApplication(safeBool(layers.application, true));
        setLayerControl(safeBool(layers.control, true));
        setLayerDataplane(safeBool(layers.dataplane, true));

        const plan = (cfg.metric_plan && typeof cfg.metric_plan === "object" ? (cfg.metric_plan as Record<string, unknown>) : null) as
          | Record<string, unknown>
          | null;
        setPlanEnabled(Boolean(plan));
        if (plan) {
          setPlanIntervalSec(safeNumber(plan.interval_sec, 5));
          const metrics = Array.isArray(plan.metrics) ? (plan.metrics as unknown[]) : [];
          setSelectedMetrics(metrics.map((m) => String(m)).filter(Boolean));
          const labels = Array.isArray(plan.labels) ? (plan.labels as unknown[]) : [];
          setPlanLabelsText(labels.map((l) => String(l)).join(","));
        }
      }
    } catch {
      setMessage("Falha ao carregar a configuração.");
    }
  };

  useEffect(() => {
    refreshList();
    loadMetricDefinitions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadConfig(selectedId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  const nodeIds = useMemo(() => nodes.map((n) => n.id.trim()).filter(Boolean), [nodes]);
  const nodeIdSet = useMemo(() => new Set(nodeIds), [nodeIds]);
  const hasDuplicateNodeIds = useMemo(() => nodeIds.length !== nodeIdSet.size, [nodeIds, nodeIdSet]);

  const hostNodes = useMemo(() => nodes.filter((n) => n.role === "host"), [nodes]);
  const switchNodes = useMemo(() => nodes.filter((n) => n.role === "switch"), [nodes]);
  const controllerNodes = useMemo(() => nodes.filter((n) => n.role === "controller"), [nodes]);

  const needsPing = useMemo(() => layerNetwork, [layerNetwork]);
  const needsOvsOfctl = useMemo(() => layerControl || layerDataplane, [layerControl, layerDataplane]);
  const requiresDockerExec = useMemo(() => envMode === "docker", [envMode]);

  const selectedMetricsNormalized = useMemo(() => {
    const uniq = new Set<string>();
    for (const m of selectedMetrics) {
      const v = String(m || "").trim();
      if (v) uniq.add(v);
    }
    return Array.from(uniq);
  }, [selectedMetrics]);

  const parsedPlanLabels = useMemo(() => {
    return planLabelsText
      .split(/\r?\n|,/)
      .map((s) => s.trim())
      .filter(Boolean);
  }, [planLabelsText]);

  const metricLayerByName = useMemo(() => {
    const map = new Map<string, string>();
    for (const d of metricDefs) {
      if (d?.name) {
        const layer = (d.layer || "").toString().trim();
        if (layer) map.set(d.name, layer);
      }
    }
    return map;
  }, [metricDefs]);

  const defsByLayer = useMemo(() => {
    const groups = new Map<string, MetricDef[]>();
    for (const d of metricDefs) {
      const layer = (d.layer || "unknown").toString() || "unknown";
      if (!groups.has(layer)) groups.set(layer, []);
      groups.get(layer)!.push(d);
    }
    const sortedLayers = Array.from(groups.keys()).sort();
    return sortedLayers.map((layer) => ({
      layer,
      defs: (groups.get(layer) || []).slice().sort((a, b) => a.name.localeCompare(b.name)),
    }));
  }, [metricDefs]);

  const builtConfig = useMemo(() => {
    const env: Record<string, unknown> = {
      mode: envMode,
    };
    if (envMode === "docker") {
      env.docker_network = dockerNetwork.trim();
    }
    if (sshKeyPath.trim()) env.ssh_key_path = sshKeyPath.trim();

    const controllers = controllerEnabled
      ? [
          {
            id: controllerId.trim(),
            type: controllerType,
            api_base_url: controllerApiBaseUrl.trim(),
            openflow: { host: openflowHost.trim(), port: openflowPort },
            auth: { mode: "none", token: null, username: null, password: null },
          },
        ]
      : [];

    const builtNodes = nodes
      .map((n) => ({
        id: n.id.trim(),
        role: n.role,
        mgmt_ip: n.mgmt_ip.trim() || undefined,
        image: n.image.trim() || undefined,
        container_name: n.container_name.trim() || undefined,
        bridge: n.bridge.trim() || undefined,
        datapath_id: n.datapath_id.trim() || undefined,
        ofctl: n.ofctl_host.trim() ? { host: n.ofctl_host.trim(), port: n.ofctl_port } : undefined,
        meta: { ssh_user: n.ssh_user.trim() || "root", ssh_port: n.ssh_port || 22 },
      }))
      .filter((n) => n.id);

    const builtLinks = links
      .map((l) => ({
        source: l.source.trim(),
        target: l.target.trim(),
        bandwidth_mbps: l.bandwidth_mbps,
        delay_ms: l.delay_ms,
        loss_pct: l.loss_pct,
      }))
      .filter((l) => l.source && l.target);

    const metric_layers = {
      service: layerService,
      physical: layerPhysical,
      link: layerLink,
      network: layerNetwork,
      transport: layerTransport,
      session: layerSession,
      presentation: layerPresentation,
      application: layerApplication,
      control: layerControl,
      dataplane: layerDataplane,
    };

    const metric_plan =
      planEnabled && selectedMetricsNormalized.length
        ? {
            metrics: selectedMetricsNormalized,
            interval_sec: planIntervalSec,
            labels: parsedPlanLabels,
            metric_layers: Object.fromEntries(
              selectedMetricsNormalized.map((m) => [m, metricLayerByName.get(m) || planDefaultLayer])
            ),
          }
        : undefined;

    const next: Record<string, unknown> = {
      ...(baseConfig || {}),
      environment: env,
      controllers,
      default_controller: controllerEnabled ? controllerId.trim() : undefined,
      nodes: builtNodes,
      links: builtLinks,
      metric_layers,
    };
    if (metric_plan) next.metric_plan = metric_plan;
    else if ("metric_plan" in next) delete next.metric_plan;
    return next;
  }, [
    baseConfig,
    controllerApiBaseUrl,
    controllerEnabled,
    controllerId,
    controllerType,
    dockerNetwork,
    envMode,
    layerApplication,
    layerControl,
    layerDataplane,
    layerLink,
    layerNetwork,
    layerPhysical,
    layerPresentation,
    layerService,
    layerSession,
    layerTransport,
    links,
    nodeIdSet,
    nodes,
    openflowHost,
    openflowPort,
    parsedPlanLabels,
    planDefaultLayer,
    planEnabled,
    planIntervalSec,
    selectedMetricsNormalized,
    metricLayerByName,
    sshKeyPath,
  ]);

  const validationError = useMemo(() => {
    if (!name.trim()) return "Nome do perfil é obrigatório.";
    if (envMode === "docker" && !dockerNetwork.trim()) return "Docker network é obrigatório no modo docker.";
    if (!nodes.length || !nodes.some((n) => n.id.trim())) return "Informe ao menos 1 nó (id).*";
    if (hasDuplicateNodeIds) return "IDs de nós duplicados.";

    if (requiresDockerExec) {
      for (const n of nodes) {
        if (!n.id.trim()) continue;
        if (!n.container_name.trim()) return "No modo docker, container_name é obrigatório para cada nó (use o mesmo valor do id se quiser).";
      }
    }

    if (needsPing) {
      if (hostNodes.length < 2) return "Para coletar latência/perda (network), você precisa de pelo menos 2 hosts.";
      for (const h of hostNodes) {
        if (!h.id.trim()) continue;
        if (!h.mgmt_ip.trim()) return "Para coletar latência/perda (network), mgmt_ip é obrigatório nos hosts.";
      }
    }

    if (needsOvsOfctl) {
      if (switchNodes.length < 1) return "Para coletar control/dataplane (ovs-ofctl), você precisa de pelo menos 1 switch.";
    }

    for (const l of links) {
      const s = l.source.trim();
      const t = l.target.trim();
      if (!s && !t) continue;
      if (!s || !t) return "Links precisam de source e target.";
      if (!nodeIdSet.has(s) || !nodeIdSet.has(t)) return "Links devem referenciar IDs de nós existentes.";
    }
    if (planEnabled && !selectedMetricsNormalized.length) return "Plano de métricas: informe pelo menos 1 métrica.";
    return "";
  }, [
    dockerNetwork,
    envMode,
    hasDuplicateNodeIds,
    hostNodes,
    links,
    needsOvsOfctl,
    needsPing,
    name,
    nodeIdSet,
    nodes,
    selectedMetricsNormalized.length,
    planEnabled,
    requiresDockerExec,
    switchNodes,
  ]);

  const editor = useMemo(() => prettyJson(builtConfig), [builtConfig]);

  const onSave = async (setActive: boolean) => {
    setSaving(true);
    setMessage("");
    try {
      if (validationError) {
        setMessage(validationError);
        return;
      }
      const cfg = builtConfig as Record<string, unknown>;
      const payload = {
        id: name,
        name,
        description: description || loaded?.description || "",
        environment: envMode,
        config: cfg,
        set_active: setActive,
      };
      const resp = await fetch(`${apiBase.replace(/\/$/, "")}/configs`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });
      if (!resp.ok) {
        const txt = await resp.text();
        setMessage(txt || "Falha ao salvar.");
      } else {
        setMessage(setActive ? "Configuração salva e ativada." : "Configuração salva.");
        await refreshList();
        setSelectedId(name);
      }
    } catch {
      setMessage("Falha ao salvar.");
    } finally {
      setSaving(false);
    }
  };

  const onActivate = async () => {
    setSaving(true);
    setMessage("");
    try {
      const resp = await fetch(`${apiBase.replace(/\/$/, "")}/configs/${encodeURIComponent(selectedId)}/activate`, {
        method: "POST",
        headers,
      });
      if (!resp.ok) {
        const txt = await resp.text();
        setMessage(txt || "Falha ao ativar.");
      } else {
        setMessage("Configuração ativada.");
        await refreshList();
      }
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async () => {
    if (!confirm(`Remover configuração '${selectedId}'?`)) return;
    setSaving(true);
    setMessage("");
    try {
      const resp = await fetch(`${apiBase.replace(/\/$/, "")}/configs/${encodeURIComponent(selectedId)}`, {
        method: "DELETE",
        headers,
      });
      if (!resp.ok) {
        const txt = await resp.text();
        setMessage(txt || "Falha ao remover.");
      } else {
        setMessage("Configuração removida.");
        await refreshList();
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Configurações"
        subtitle="Crie/edite múltiplas configurações (topologia + plano de métricas) e selecione qual fica ativa na plataforma."
      />

      <Section title="Perfis salvos" description="Selecione um perfil (ex: lft-profissa) ou crie outro e ative quando quiser.">
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 260 }}>
            <span className="muted">Perfil</span>
            <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
              {items.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.active ? "(ativo) " : ""}
                  {c.name}
                </option>
              ))}
            </select>
          </label>

          <button className="btn" type="button" onClick={refreshList} disabled={listStatus === "loading"}>
            Recarregar
          </button>
          <button className="btn" type="button" onClick={onActivate} disabled={saving || !selectedId}>
            Ativar
          </button>
          <button className="btn" type="button" onClick={onDelete} disabled={saving || selectedId === "lft-profissa"}>
            Remover
          </button>

          <div className="muted" style={{ flex: "1 1 auto" }}>
            {listStatus === "loading" ? "Carregando..." : listStatus === "error" ? "Erro ao listar configs" : ""}
          </div>
        </div>
      </Section>

      <Section title="Edição guiada" description="Preencha os campos abaixo. O JSON é gerado automaticamente (preview no final).">
        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span className="muted">{req("Nome do perfil")}</span>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="ex: lft-profissa" />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span className="muted">Descrição</span>
              <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="opcional" />
            </label>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span className="muted">{req("Modo")}</span>
              <select value={envMode} onChange={(e) => setEnvMode(e.target.value as EnvMode)}>
                <option value="docker">docker</option>
                <option value="local">local</option>
              </select>
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span className="muted">{envMode === "docker" ? req("Docker network") : "Docker network"}</span>
              <input value={dockerNetwork} onChange={(e) => setDockerNetwork(e.target.value)} placeholder="ex: sdn_lab_net" disabled={envMode !== "docker"} />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span className="muted">SSH key path</span>
              <input value={sshKeyPath} onChange={(e) => setSshKeyPath(e.target.value)} placeholder="ex: ~/.ssh/id_rsa" />
            </label>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="checkbox" checked={controllerEnabled} onChange={(e) => setControllerEnabled(e.target.checked)} />
              <span className="muted">Habilitar controller</span>
            </label>
          </div>

          {controllerEnabled ? (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span className="muted">Controller ID</span>
                <input value={controllerId} onChange={(e) => setControllerId(e.target.value)} placeholder="ex: ctrl-ryu" />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span className="muted">Tipo</span>
                <select value={controllerType} onChange={(e) => setControllerType(e.target.value as ControllerType)}>
                  <option value="ryu">ryu</option>
                  <option value="onos">onos</option>
                  <option value="odl">odl</option>
                  <option value="floodlight">floodlight</option>
                </select>
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span className="muted">API base URL</span>
                <input value={controllerApiBaseUrl} onChange={(e) => setControllerApiBaseUrl(e.target.value)} placeholder="http://127.0.0.1:8080" />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span className="muted">OpenFlow host</span>
                <input value={openflowHost} onChange={(e) => setOpenflowHost(e.target.value)} placeholder="127.0.0.1" />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span className="muted">OpenFlow port</span>
                <input type="number" value={openflowPort} onChange={(e) => setOpenflowPort(Number(e.target.value))} />
              </label>
            </div>
          ) : null}

          <div>
            <div className="muted" style={{ marginBottom: 6 }}>
              {req("Nós")} (id + role). Você pode adicionar/remover.
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10 }}>
              {nodes.map((n, idx) => (
                <div key={idx} style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 1.2fr 1fr auto", gap: 10, alignItems: "end" }}>
                  <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <span className="muted">{req("id")}</span>
                    <input
                      value={n.id}
                      onChange={(e) =>
                        setNodes((prev) => prev.map((x, i) => (i === idx ? { ...x, id: e.target.value } : x)))
                      }
                      placeholder="ex: s1"
                    />
                  </label>
                  <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <span className="muted">{req("role")}</span>
                    <select
                      value={n.role}
                      onChange={(e) =>
                        setNodes((prev) => prev.map((x, i) => (i === idx ? { ...x, role: e.target.value as NodeRole } : x)))
                      }
                    >
                      <option value="controller">controller</option>
                      <option value="switch">switch</option>
                      <option value="host">host</option>
                    </select>
                  </label>
                  <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <span className="muted">{needsPing && n.role === "host" ? req("mgmt_ip") : "mgmt_ip"}</span>
                    <input
                      value={n.mgmt_ip}
                      onChange={(e) =>
                        setNodes((prev) => prev.map((x, i) => (i === idx ? { ...x, mgmt_ip: e.target.value } : x)))
                      }
                      placeholder="ex: 172.20.0.11"
                    />
                  </label>
                  <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <span className="muted">{requiresDockerExec ? req("container_name") : "container_name"}</span>
                    <input
                      value={n.container_name}
                      onChange={(e) =>
                        setNodes((prev) => prev.map((x, i) => (i === idx ? { ...x, container_name: e.target.value } : x)))
                      }
                      placeholder="ex: s1"
                    />
                  </label>
                  <button
                    className="btn"
                    type="button"
                    onClick={() => setNodes((prev) => prev.filter((_, i) => i !== idx))}
                    disabled={nodes.length <= 1}
                    aria-label="Remover nó"
                  >
                    Remover
                  </button>
                </div>
              ))}
              <div>
                <button className="btn" type="button" onClick={() => setNodes((prev) => [...prev, defaultNode("host")])}>
                  Adicionar nó
                </button>
                {hasDuplicateNodeIds ? <span className="muted" style={{ marginLeft: 10 }}>IDs duplicados.</span> : null}
              </div>
            </div>
          </div>

          <div>
            <div className="muted" style={{ marginBottom: 6 }}>
              Links (source/target devem ser IDs de nós)
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10 }}>
              {links.map((l, idx) => (
                <div key={idx} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 0.8fr 0.8fr 0.8fr auto", gap: 10, alignItems: "end" }}>
                  <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <span className="muted">{req("source")}</span>
                    <input
                      value={l.source}
                      onChange={(e) => setLinks((prev) => prev.map((x, i) => (i === idx ? { ...x, source: e.target.value } : x)))}
                      placeholder="ex: s1"
                    />
                  </label>
                  <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <span className="muted">{req("target")}</span>
                    <input
                      value={l.target}
                      onChange={(e) => setLinks((prev) => prev.map((x, i) => (i === idx ? { ...x, target: e.target.value } : x)))}
                      placeholder="ex: h1"
                    />
                  </label>
                  <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <span className="muted">bw (Mbps)</span>
                    <input
                      type="number"
                      value={l.bandwidth_mbps}
                      onChange={(e) => setLinks((prev) => prev.map((x, i) => (i === idx ? { ...x, bandwidth_mbps: Number(e.target.value) } : x)))}
                    />
                  </label>
                  <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <span className="muted">delay (ms)</span>
                    <input
                      type="number"
                      value={l.delay_ms}
                      onChange={(e) => setLinks((prev) => prev.map((x, i) => (i === idx ? { ...x, delay_ms: Number(e.target.value) } : x)))}
                    />
                  </label>
                  <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <span className="muted">loss (%)</span>
                    <input
                      type="number"
                      value={l.loss_pct}
                      onChange={(e) => setLinks((prev) => prev.map((x, i) => (i === idx ? { ...x, loss_pct: Number(e.target.value) } : x)))}
                    />
                  </label>
                  <button className="btn" type="button" onClick={() => setLinks((prev) => prev.filter((_, i) => i !== idx))} disabled={links.length <= 1}>
                    Remover
                  </button>
                </div>
              ))}
              <div>
                <button className="btn" type="button" onClick={() => setLinks((prev) => [...prev, defaultLink()])}>
                  Adicionar link
                </button>
              </div>
            </div>
          </div>

          <div>
            <div className="muted" style={{ marginBottom: 6 }}>
              Camadas de métricas
            </div>
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
              <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input type="checkbox" checked={layerService} onChange={(e) => setLayerService(e.target.checked)} />
                <span className="muted">service</span>
              </label>
              <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input type="checkbox" checked={layerPhysical} onChange={(e) => setLayerPhysical(e.target.checked)} />
                <span className="muted">physical</span>
              </label>
              <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input type="checkbox" checked={layerLink} onChange={(e) => setLayerLink(e.target.checked)} />
                <span className="muted">link</span>
              </label>
              <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input type="checkbox" checked={layerNetwork} onChange={(e) => setLayerNetwork(e.target.checked)} />
                <span className="muted">network</span>
              </label>
              <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input type="checkbox" checked={layerTransport} onChange={(e) => setLayerTransport(e.target.checked)} />
                <span className="muted">transport</span>
              </label>
              <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input type="checkbox" checked={layerSession} onChange={(e) => setLayerSession(e.target.checked)} />
                <span className="muted">session</span>
              </label>
              <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input type="checkbox" checked={layerPresentation} onChange={(e) => setLayerPresentation(e.target.checked)} />
                <span className="muted">presentation</span>
              </label>
              <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input type="checkbox" checked={layerApplication} onChange={(e) => setLayerApplication(e.target.checked)} />
                <span className="muted">application</span>
              </label>
              <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input type="checkbox" checked={layerControl} onChange={(e) => setLayerControl(e.target.checked)} />
                <span className="muted">control</span>
              </label>
              <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input type="checkbox" checked={layerDataplane} onChange={(e) => setLayerDataplane(e.target.checked)} />
                <span className="muted">dataplane</span>
              </label>
            </div>
          </div>

          <div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input type="checkbox" checked={planEnabled} onChange={(e) => setPlanEnabled(e.target.checked)} />
                <span className="muted">Habilitar plano de métricas</span>
              </label>
            </div>
            {planEnabled ? (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginTop: 10 }}>
                <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <span className="muted">interval_sec</span>
                  <input type="number" value={planIntervalSec} onChange={(e) => setPlanIntervalSec(Number(e.target.value))} />
                </label>
                <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <span className="muted">Camada padrão</span>
                  <select value={planDefaultLayer} onChange={(e) => setPlanDefaultLayer(e.target.value)}>
                    <option value="service">service</option>
                    <option value="physical">physical</option>
                    <option value="link">link</option>
                    <option value="network">network</option>
                    <option value="transport">transport</option>
                    <option value="session">session</option>
                    <option value="presentation">presentation</option>
                    <option value="application">application</option>
                    <option value="control">control</option>
                    <option value="dataplane">dataplane</option>
                  </select>
                </label>
                <label style={{ display: "flex", flexDirection: "column", gap: 6, gridColumn: "1 / -1" }}>
                  <span className="muted">labels (separado por vírgula)</span>
                  <input value={planLabelsText} onChange={(e) => setPlanLabelsText(e.target.value)} placeholder="experiment_id,run_id,src,dst" />
                </label>

                <div style={{ gridColumn: "1 / -1" }}>
                  <div className="muted" style={{ marginBottom: 6 }}>
                    {req("Métricas")} (selecione por camada)
                  </div>
                  <div className="muted" style={{ marginBottom: 8 }}>
                    {metricDefsStatus === "loading" ? "Carregando catálogo..." : metricDefsStatus === "error" ? "Falha ao carregar catálogo." : `Selecionadas: ${selectedMetricsNormalized.length}`}
                  </div>

                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
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

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
                    {defsByLayer.map((g) => (
                      <div key={g.layer} style={{ border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: 10 }}>
                        <div className="muted" style={{ marginBottom: 8 }}>
                          Camada: <strong>{g.layer}</strong>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 6, maxHeight: 220, overflow: "auto" }}>
                          {g.defs.map((d) => {
                            const checked = selectedMetricsNormalized.includes(d.name);
                            const title = d.description ? `${d.description}${d.unit ? ` (${d.unit})` : ""}` : d.unit ? `(${d.unit})` : "";
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
                </div>
              </div>
            ) : null}
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <button className="btn" type="button" onClick={() => onSave(false)} disabled={saving || Boolean(validationError)}>
              Salvar
            </button>
            <button className="btn" type="button" onClick={() => onSave(true)} disabled={saving || Boolean(validationError)}>
              Salvar e ativar
            </button>
            <button
              className="btn"
              type="button"
              onClick={() => {
                if (!loaded) return;
                // Reload config into form by re-calling load.
                loadConfig(selectedId);
                setMessage("Revertido para a versão carregada.");
              }}
              disabled={!loaded}
            >
              Reverter
            </button>

            {validationError ? <span className="muted">{validationError}</span> : null}
            {message ? <span className="muted">{message}</span> : null}
          </div>
        </div>
      </Section>

      <Section title="Preview do JSON" description="Gerado automaticamente a partir das seleções acima.">
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span className="muted">platform_config.json</span>
          <textarea value={editor} readOnly rows={18} style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace" }} />
        </label>
      </Section>
    </div>
  );
};

export default Settings;
