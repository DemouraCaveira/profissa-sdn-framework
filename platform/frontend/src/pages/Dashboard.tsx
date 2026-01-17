import React, { useEffect, useMemo, useState } from "react";
import PageHeader from "../components/PageHeader";
import Section from "../components/Section";
import MetricCard from "../components/MetricCard";
import { useEventStream } from "../hooks/useEventStream";
import StatusDot from "../components/StatusDot";

type MetricDefinitionDTO = {
  name: string;
  description: string;
  unit?: string | null;
  layer?: string | null;
  kind?: string | null;
  osi_layer?: number | null;
  category?: string | null;
  tags?: string[];
  dimensions?: string[];
};

const brTime = (ts: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(ts));

const Dashboard: React.FC = () => {
  const { data, status, url: streamUrl } = useEventStream();
  const [definitions, setDefinitions] = useState<MetricDefinitionDTO[]>([]);
  const [defsStatus, setDefsStatus] = useState<"loading" | "ok" | "error">("loading");

  const [view, setView] = useState<"overview" | "all" | "p1" | "p2" | "p3" | "p4" | "p5" | "p6">("overview");
  const [layer, setLayer] = useState<string>("");
  const [category, setCategory] = useState<string>("");
  const [kind, setKind] = useState<string>("");
  const [query, setQuery] = useState<string>("");
  const [onlyWithData, setOnlyWithData] = useState<boolean>(false);

  const apiBase = useMemo(() => {
    // streamUrl = <base>/stream/events
    return streamUrl.replace(/\/stream\/events\/?$/, "");
  }, [streamUrl]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        setDefsStatus("loading");
        const resp = await fetch(`${apiBase}/metrics/definitions`);
        const json = (await resp.json()) as MetricDefinitionDTO[];
        if (!cancelled) {
          setDefinitions(Array.isArray(json) ? json : []);
          setDefsStatus("ok");
        }
      } catch (_) {
        if (!cancelled) setDefsStatus("error");
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [apiBase]);

  const latestByMetric = useMemo(() => {
    const out = new Map<string, any>();
    for (const sample of data?.metrics ?? []) {
      const cur = out.get(sample.metric);
      if (!cur || new Date(sample.timestamp).getTime() > new Date(cur.timestamp).getTime()) {
        out.set(sample.metric, sample);
      }
    }
    return out;
  }, [data]);

  const lastSampleTs = useMemo(() => {
    const last = (data?.metrics ?? []).at(-1);
    return last?.timestamp ? String(last.timestamp) : null;
  }, [data]);

  const formatValue = (m: any, def?: MetricDefinitionDTO) => {
    if (!m) return "-";
    const v = typeof m.value === "number" ? Number(m.value).toFixed(2) : String(m.value);
    const unit = def?.unit ? String(def.unit) : "";
    return unit ? `${v} ${unit}` : v;
  };

  const defsByName = useMemo(() => {
    const map = new Map<string, MetricDefinitionDTO>();
    for (const d of definitions) map.set(d.name, d);
    return map;
  }, [definitions]);

  const hasData = (metricName: string) => Boolean(latestByMetric.get(metricName));

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const d of definitions) if (d.category) set.add(String(d.category));
    return Array.from(set.values()).sort();
  }, [definitions]);

  const kinds = useMemo(() => {
    const set = new Set<string>();
    for (const d of definitions) if (d.kind) set.add(String(d.kind));
    return Array.from(set.values()).sort();
  }, [definitions]);

  const layers = useMemo(() => {
    const order = [
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
    ];
    const set = new Set<string>();
    for (const d of definitions) if (d.layer) set.add(String(d.layer));
    return order.filter((x) => set.has(x));
  }, [definitions]);

  const applyFilters = (defs: MetricDefinitionDTO[]) => {
    const q = query.trim().toLowerCase();
    return defs.filter((d) => {
      if (layer && String(d.layer ?? "") !== layer) return false;
      if (category && String(d.category ?? "") !== category) return false;
      if (kind && String(d.kind ?? "") !== kind) return false;
      if (onlyWithData && !hasData(d.name)) return false;
      if (q) {
        const hay = `${d.name} ${d.description} ${d.layer ?? ""} ${d.category ?? ""} ${(d.tags ?? []).join(" ")}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  };

  const pick = (names: string[]) => {
    for (const n of names) {
      const s = latestByMetric.get(n);
      if (s) return { name: n, sample: s, def: defsByName.get(n) };
    }
    return { name: names[0] ?? "-", sample: null, def: defsByName.get(names[0] ?? "") };
  };

  const pageDefs = useMemo(() => {
    const all = definitions;
    const by = (pred: (d: MetricDefinitionDTO) => boolean) => all.filter(pred);

    const p1 = by((d) => d.layer === "service" || d.osi_layer === 0);
    const p2 = by((d) => d.category === "capacity" || d.category === "performance" || d.name.includes("queue_") || d.name.includes("util"));
    const p3 = by((d) => d.category === "routing" || d.category === "control" || d.name.startsWith("bgp_") || d.name.startsWith("ospf_") || d.name.startsWith("isis_") || d.name.includes("route_"));
    const p4 = by((d) => d.layer === "link" || d.osi_layer === 2 || d.category === "l2");
    const p5 = by((d) => ["transport", "session", "presentation", "application"].includes(String(d.layer)));
    const p6 = by((d) => d.category === "security" || d.name.includes("ddos_") || d.name.includes("firewall_") || d.name.includes("anomaly_"));

    const uniq = (defs: MetricDefinitionDTO[]) => {
      const seen = new Set<string>();
      return defs.filter((d) => (seen.has(d.name) ? false : (seen.add(d.name), true)));
    };

    return {
      p1: uniq(p1),
      p2: uniq(p2),
      p3: uniq(p3),
      p4: uniq(p4),
      p5: uniq(p5),
      p6: uniq(p6),
    };
  }, [definitions]);

  const worstPaths = useMemo(() => {
    const samples = data?.metrics ?? [];
    const byKey = new Map<string, any>();
    for (const s of samples) {
      if (!["e2e_loss_pct", "e2e_latency_ms_p95", "e2e_jitter_ms_p95"].includes(s.metric)) continue;
      const src = String(s.labels?.src ?? "-");
      const dst = String(s.labels?.dst ?? "-");
      const key = `${src}→${dst}`;
      const cur = byKey.get(key) ?? { key, src, dst };
      cur[s.metric] = s;
      byKey.set(key, cur);
    }
    const scored = Array.from(byKey.values()).map((x) => {
      const loss = Number(x.e2e_loss_pct?.value ?? 0);
      const lat = Number(x.e2e_latency_ms_p95?.value ?? 0);
      const jit = Number(x.e2e_jitter_ms_p95?.value ?? 0);
      const score = loss * 100 + lat + jit;
      return { ...x, score };
    });
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, 10);
  }, [data]);

  const MetricsTable: React.FC<{ defs: MetricDefinitionDTO[] }> = ({ defs }) => {
    if (!defs.length) return <div className="muted">Sem métricas nesta seção.</div>;

    return (
      <div className="card table-card">
        <table>
          <thead>
            <tr>
              <th>Status</th>
              <th>Métrica</th>
              <th>Descrição</th>
              <th>Layer</th>
              <th>Categoria</th>
              <th>Unidade</th>
              <th>Último valor</th>
              <th>Nó</th>
              <th>Timestamp</th>
            </tr>
          </thead>
          <tbody>
            {defs.map((d) => {
              const s = latestByMetric.get(d.name);
              return (
                <tr key={d.name}>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <StatusDot status={s ? "ok" : "warn"} />
                      <span className="muted">{s ? "com dado" : "sem dado"}</span>
                    </div>
                  </td>
                  <td className="mono">
                    <div style={{ display: "grid", gap: 2 }}>
                      <div>{d.name}</div>
                      <div className="muted">{d.kind ? `kind: ${d.kind}` : d.osi_layer != null ? `OSI: ${d.osi_layer}` : ""}</div>
                    </div>
                  </td>
                  <td>{d.description}</td>
                  <td>{d.layer ?? "-"}</td>
                  <td>{d.category ?? "-"}</td>
                  <td>{d.unit ?? "-"}</td>
                  <td>{formatValue(s, d)}</td>
                  <td>{s?.node ?? "-"}</td>
                  <td>{s?.timestamp ? brTime(String(s.timestamp)) : "-"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  const kpiAvail = pick(["e2e_path_availability_pct"]);
  const kpiLat = pick(["e2e_latency_ms_p95", "latency_ms"]);
  const kpiLoss = pick(["e2e_loss_pct", "packet_loss_pct"]);
  const kpiJit = pick(["e2e_jitter_ms_p95", "jitter_ms"]);

  const summaryCounts = useMemo(() => {
    const total = definitions.length;
    const filtered = applyFilters(definitions).length;
    const withData = applyFilters(definitions).filter((d) => hasData(d.name)).length;
    return { total, filtered, withData };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [definitions, layer, category, kind, query, onlyWithData, latestByMetric]);

  const viewMeta = {
    overview: { title: "Visão geral", desc: "KPIs + visão por camadas" },
    all: { title: "Todas as métricas", desc: "Catálogo completo (aplicando filtros)" },
    p1: { title: "Saúde global", desc: "E2E: disponibilidade, latência, jitter, perda" },
    p2: { title: "Capacidade", desc: "Utilização, filas, drops, microbursts" },
    p3: { title: "Controle/roteamento", desc: "BGP/OSPF/IS-IS, convergência, churn" },
    p4: { title: "L2/Access", desc: "STP, ARP/ND, VLAN inconsistências, flaps" },
    p5: { title: "Transporte/App", desc: "TCP, DNS, HTTP, TLS" },
    p6: { title: "Segurança", desc: "Denies, anomalias, sinais de DDoS" },
  } as const;

  const layerLabels: Record<string, string> = {
    service: "L0 Serviço",
    physical: "L1 Física",
    link: "L2 Enlace",
    network: "L3 Rede",
    transport: "L4 Transporte",
    session: "L5 Sessão",
    presentation: "L6 Apresentação",
    application: "L7 Aplicação",
    control: "Plano Controle",
    dataplane: "Plano Dados",
  };

  const layerSummary = useMemo(() => {
    return layers.map((l) => {
      const defs = definitions.filter((d) => String(d.layer ?? "") === l);
      const withData = defs.filter((d) => hasData(d.name)).length;
      return { layer: l, defs: defs.length, withData };
    });
  }, [layers, definitions, latestByMetric]);

  const currentDefs = useMemo(() => {
    const source =
      view === "p1"
        ? pageDefs.p1
        : view === "p2"
          ? pageDefs.p2
          : view === "p3"
            ? pageDefs.p3
            : view === "p4"
              ? pageDefs.p4
              : view === "p5"
                ? pageDefs.p5
                : view === "p6"
                  ? pageDefs.p6
                  : definitions;
    return applyFilters(source);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, pageDefs, definitions, layer, category, kind, query, onlyWithData, latestByMetric]);

  const resetFilters = () => {
    setLayer("");
    setCategory("");
    setKind("");
    setQuery("");
    setOnlyWithData(false);
  };

  const viewOrder: Array<typeof view> = ["overview", "p1", "p2", "p3", "p4", "p5", "p6", "all"];

  return (
    <div className="page">
      <PageHeader
        title="Observabilidade"
        subtitle={`API: ${apiBase}`}
        right={
          <>
            <span className="tag" style={{ background: "transparent", border: "1px solid var(--border)", color: "var(--text)" }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                <StatusDot status={status === "open" ? "ok" : status === "connecting" ? "warn" : "down"} />
                stream: {status}
              </span>
            </span>
            <span className="tag" style={{ background: "transparent", border: "1px solid var(--border)", color: "var(--text)" }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                <StatusDot status={defsStatus === "ok" ? "ok" : defsStatus === "loading" ? "warn" : "down"} />
                definitions: {defsStatus}
              </span>
            </span>
            <span className="tag" style={{ background: "transparent", border: "1px solid var(--border)", color: "var(--text)" }}>
              métricas no stream: {(data?.metrics ?? []).length}
            </span>
            <span className="tag" style={{ background: "transparent", border: "1px solid var(--border)", color: "var(--text)" }}>
              defs: {definitions.length}
            </span>
            <span className="tag" style={{ background: "transparent", border: "1px solid var(--border)", color: "var(--text)" }}>
              última amostra: {lastSampleTs ? brTime(lastSampleTs) : "-"}
            </span>
          </>
        }
      />

      {defsStatus === "loading" ? (
        <div className="card">
          <div style={{ display: "grid", gap: 6 }}>
            <div style={{ fontWeight: 700 }}>Carregando catálogo de métricas…</div>
            <div className="muted">Buscando em {apiBase}/metrics/definitions</div>
          </div>
        </div>
      ) : null}

      {defsStatus === "error" ? (
        <div className="card">
          <div style={{ display: "grid", gap: 6 }}>
            <div style={{ fontWeight: 700 }}>Não foi possível carregar o catálogo de métricas.</div>
            <div className="muted">Verifique se o backend está rodando e acessível em {apiBase}.</div>
          </div>
        </div>
      ) : null}

      <div className="card dashboard-top-filters">
        <div style={{ display: "grid", gap: 12 }}>
          <div className="chip-row" style={{ justifyContent: "space-between" }}>
            <div className="chip-row" style={{ flexWrap: "wrap" }}>
              {viewOrder.map((v) => (
                <button
                  key={v}
                  className={`chip ${view === v ? "chip-active" : ""}`}
                  onClick={() => setView(v)}
                  type="button"
                >
                  {viewMeta[v].title}
                </button>
              ))}
            </div>
            <div className="muted">defs: {summaryCounts.filtered}/{summaryCounts.total} • com dado: {summaryCounts.withData}</div>
          </div>

          <div className="subgrid" style={{ gridTemplateColumns: "2fr 1fr 1fr 1fr" }}>
            <div className="field">
              <label>Busca</label>
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="nome, descrição, tags…" />
            </div>
            <div className="field">
              <label>Camada</label>
              <select value={layer} onChange={(e) => setLayer(e.target.value)}>
                <option value="">Todas</option>
                {layers.map((l) => (
                  <option key={l} value={l}>
                    {layerLabels[l] ?? l}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Categoria</label>
              <select value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="">Todas</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Kind</label>
              <select value={kind} onChange={(e) => setKind(e.target.value)}>
                <option value="">Todos</option>
                {kinds.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="chip-row" style={{ justifyContent: "space-between" }}>
            <div className="chip-row">
              <button className={`chip ${onlyWithData ? "chip-active" : ""}`} onClick={() => setOnlyWithData((v) => !v)} type="button">
                só com dados
              </button>
              <button className="chip" onClick={resetFilters} type="button">
                limpar filtros
              </button>
            </div>
            <div className="muted">{viewMeta[view].desc}</div>
          </div>
        </div>
      </div>

      <Section title={viewMeta[view].title} description={viewMeta[view].desc}>
        {view === "overview" ? (
          <>
            <div className="grid-cards">
              <MetricCard title="Disponibilidade E2E" value={formatValue(kpiAvail.sample, kpiAvail.def)} subtitle={kpiAvail.name} />
              <MetricCard title="Latência E2E" value={formatValue(kpiLat.sample, kpiLat.def)} subtitle={kpiLat.name} />
              <MetricCard title="Perda E2E" value={formatValue(kpiLoss.sample, kpiLoss.def)} subtitle={kpiLoss.name} />
              <MetricCard title="Jitter E2E" value={formatValue(kpiJit.sample, kpiJit.def)} subtitle={kpiJit.name} />
            </div>

            <Section title="Camadas" subtitle="Use o filtro “Camada” acima para detalhar.">
              <div className="card table-card">
                <table>
                  <thead>
                    <tr>
                      <th>Camada</th>
                      <th>Defs</th>
                      <th>Com dado</th>
                      <th>Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {layerSummary.map((x) => (
                      <tr key={x.layer}>
                        <td>{layerLabels[x.layer] ?? x.layer}</td>
                        <td>{x.defs}</td>
                        <td>{x.withData}</td>
                        <td>
                          <button className="btn" onClick={() => (setLayer(x.layer), setView("all"))} type="button">
                            Ver métricas
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>

            <Section title="Top 10 piores caminhos" subtitle="Rank baseado em loss + latency(p95) + jitter(p95).">
              <div className="card table-card">
                <table>
                  <thead>
                    <tr>
                      <th>Caminho</th>
                      <th>Score</th>
                      <th>Loss</th>
                      <th>Lat p95</th>
                      <th>Jitter p95</th>
                    </tr>
                  </thead>
                  <tbody>
                    {worstPaths.map((p: any) => (
                      <tr key={p.key}>
                        <td>{p.key}</td>
                        <td>{Number(p.score).toFixed(2)}</td>
                        <td>{p.e2e_loss_pct ? `${Number(p.e2e_loss_pct.value).toFixed(2)} %` : "-"}</td>
                        <td>{p.e2e_latency_ms_p95 ? `${Number(p.e2e_latency_ms_p95.value).toFixed(2)} ms` : "-"}</td>
                        <td>{p.e2e_jitter_ms_p95 ? `${Number(p.e2e_jitter_ms_p95.value).toFixed(2)} ms` : "-"}</td>
                      </tr>
                    ))}
                    {!worstPaths.length && (
                      <tr>
                        <td colSpan={5} className="muted">
                          Sem métricas E2E suficientes ainda (precisa de labels src/dst e métricas e2e_* no stream).
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Section>
          </>
        ) : (
          <>
            <div className="muted" style={{ marginTop: -6 }}>
              Mostrando {currentDefs.length} métricas (aplicando filtros).
            </div>
            <MetricsTable defs={currentDefs} />
          </>
        )}
      </Section>
    </div>
  );
};

export default Dashboard;
