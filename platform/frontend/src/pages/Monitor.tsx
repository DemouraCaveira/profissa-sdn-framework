import React, { useMemo, useState } from "react";
import PageHeader from "../components/PageHeader";
import Section from "../components/Section";
import MetricCard from "../components/MetricCard";
import { useEventStream } from "../hooks/useEventStream";

const formatValue = (val: number | string | undefined) =>
  typeof val === "number" ? Number(val).toFixed(2) : val ?? "-";

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

const Monitor: React.FC = () => {
  const { data, status } = useEventStream();
  const allLayers = ["application", "control", "dataplane", "link", "network", "physical", "transport"] as const;
  const [layers, setLayers] = useState<string[]>([...allLayers]);
  const [nodes, setNodes] = useState<string[]>([]);

  const availableNodes = useMemo(() => {
    const fromTopo = (data?.topology?.nodes ?? []).map((n: any) => String(n.id || n.name || ""));
    const fromMetrics = (data?.metrics ?? []).map((m) => m.node);
    return Array.from(new Set([...fromTopo, ...fromMetrics].filter(Boolean))).sort();
  }, [data]);

  const latestMetrics = useMemo(() => {
    const metrics = data?.metrics ?? [];
    const filtered = metrics.filter((m) => layers.includes(m.layer) && (nodes.length === 0 || nodes.includes(m.node)));
    return filtered.slice(-20).reverse();
  }, [data, layers, nodes]);

  const kpis = useMemo(() => {
    const metrics = (data?.metrics ?? []).filter((m) => layers.includes(m.layer) && (nodes.length === 0 || nodes.includes(m.node)));
    const pickFirst = (metricNames: string[]) => {
      for (const name of metricNames) {
        const found = metrics.find((m) => m.metric === name);
        if (found) return found.value;
      }
      return 0;
    };

    return {
      traffic: pickFirst(["packet_rate", "throughput_mbps", "ss_sockets_total", "link_util_pct"]),
      loss: pickFirst(["packet_loss_pct", "link_loss_pct", "udp_loss_pct"]),
      jitter: pickFirst(["jitter_ms", "link_jitter_ms", "udp_jitter_ms", "tcp_rtt_ms"]),
      flows: pickFirst(["openflow_flow_packets", "ss_tcp_states", "ss_tcp_sockets_total"]),
    };
  }, [data, layers, nodes]);

  const toggleLayer = (layer: string) => {
    setLayers((prev) => (prev.includes(layer) ? prev.filter((l) => l !== layer) : [...prev, layer]));
  };

  const selectAll = () => setLayers([...allLayers]);
  const clearAll = () => setLayers([]);

  const toggleNode = (node: string) => {
    setNodes((prev) => (prev.includes(node) ? prev.filter((n) => n !== node) : [...prev, node]));
  };

  const selectAllNodes = () => setNodes([...availableNodes]);
  const clearNodes = () => setNodes([]);

  const topoSummary = useMemo(() => {
    const nodesCount = data?.topology?.nodes?.length ?? 0;
    const linksCount = data?.topology?.links?.length ?? 0;
    return { nodesCount, linksCount };
  }, [data]);

  const layerCounts = useMemo(() => {
    const counters: Record<string, number> = {};
    (data?.metrics ?? []).forEach((m) => {
      counters[m.layer] = (counters[m.layer] ?? 0) + 1;
    });
    return counters;
  }, [data]);

  const streamInfo = useMemo(() => {
    const lastTs = (data?.metrics ?? []).at(-1)?.timestamp || data?.generated_at;
    return {
      lastTimestamp: lastTs ? brTime(lastTs) : "-",
      totalEvents: (data?.metrics ?? []).length,
      streamStatus: status,
      filteredNodes: nodes.length || availableNodes.length,
      filteredLayers: layers.length,
    };
  }, [data, status, nodes.length, availableNodes.length, layers.length]);

  return (
    <div className="page">
      <PageHeader
        title="Monitor"
        subtitle={`Métricas em tempo real e alertas · stream ${status}`}
      />

      <Section title="Camadas" subtitle="Escolha quais camadas quer ver nos KPIs e tabela.">
        <div className="card" style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <button
            onClick={selectAll}
            style={{ borderRadius: 10, padding: "6px 10px", border: "1px solid var(--border)", background: "transparent", color: "var(--text)", cursor: "pointer" }}
          >
            Selecionar todas
          </button>
          <button
            onClick={clearAll}
            style={{ borderRadius: 10, padding: "6px 10px", border: "1px solid var(--border)", background: "transparent", color: "var(--text)", cursor: "pointer" }}
          >
            Limpar
          </button>
          {allLayers.map((layer) => {
            const active = layers.includes(layer);
            return (
              <button
                key={layer}
                onClick={() => toggleLayer(layer)}
                style={{
                  borderRadius: 10,
                  padding: "6px 10px",
                  border: active ? "1px solid var(--accent)" : "1px solid var(--border)",
                  background: active ? "rgba(56, 189, 248, 0.12)" : "transparent",
                  color: "var(--text)",
                  cursor: "pointer",
                }}
              >
                {layer}
              </button>
            );
          })}
        </div>
      </Section>

      <Section title="Visão rápida da topologia" subtitle="Conte quantos elementos estão no stream e se algo está faltando.">
        <div className="grid-cards">
          <MetricCard title="Nós detectados" value={topoSummary.nodesCount} subtitle="hosts, controladores, switches" />
          <MetricCard title="Links" value={topoSummary.linksCount} />
          <MetricCard title="Camadas ativas" value={Object.keys(layerCounts).length} subtitle="com métricas recebidas" />
          <MetricCard title="Eventos recebidos" value={(data?.metrics ?? []).length} subtitle="no stream atual" />
        </div>
      </Section>

      <Section title="Saúde do stream" subtitle="Estado da conexão SSE e filtros aplicados.">
        <div className="grid-cards">
          <MetricCard title="Estado" value={streamInfo.streamStatus} subtitle="SSE /stream/events" />
          <MetricCard title="Última atualização" value={streamInfo.lastTimestamp} subtitle="horário Brasília" />
          <MetricCard title="Nós em exibição" value={streamInfo.filteredNodes} subtitle={nodes.length ? "filtrados" : "todos"} />
          <MetricCard title="Camadas em exibição" value={streamInfo.filteredLayers} subtitle={layers.length ? "selecionadas" : "todas"} />
        </div>
      </Section>

      <Section title="Nós" subtitle="Filtre por hosts/controladores/switches da topologia.">
        <div className="card" style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <button
            onClick={selectAllNodes}
            style={{ borderRadius: 10, padding: "6px 10px", border: "1px solid var(--border)", background: "transparent", color: "var(--text)", cursor: "pointer" }}
          >
            Selecionar todos
          </button>
          <button
            onClick={clearNodes}
            style={{ borderRadius: 10, padding: "6px 10px", border: "1px solid var(--border)", background: "transparent", color: "var(--text)", cursor: "pointer" }}
          >
            Limpar
          </button>
          {availableNodes.length === 0 && <span className="muted">Sem nós detectados ainda</span>}
          {availableNodes.map((node) => {
            const selected = nodes.length === 0 || nodes.includes(node);
            return (
              <button
                key={node}
                onClick={() => toggleNode(node)}
                style={{
                  borderRadius: 10,
                  padding: "6px 10px",
                  border: selected ? "1px solid var(--accent)" : "1px solid var(--border)",
                  background: selected ? "rgba(52, 211, 153, 0.15)" : "transparent",
                  color: "var(--text)",
                  cursor: "pointer",
                }}
              >
                {node}
              </button>
            );
          })}
        </div>
      </Section>

      <Section title="KPIs ao vivo">
        <div className="grid-cards">
          <MetricCard title="Tráfego" value={formatValue(kpis.traffic)} subtitle="usa packet_rate/throughput" />
          <MetricCard title="Perda" value={`${formatValue(kpis.loss)}%`} />
          <MetricCard title="Jitter" value={`${formatValue(kpis.jitter)} ms`} />
          <MetricCard title="Flows" value={formatValue(kpis.flows)} subtitle="OpenFlow ou sockets" />
        </div>
      </Section>

      <Section title="Eventos ao vivo" description="Dados vindos via SSE /stream/events">
        <div className="card table-card">
          <table>
            <thead>
              <tr>
                <th>Métrica</th>
                <th>No</th>
                <th>Valor</th>
                <th>Layer</th>
                <th>Timestamp</th>
              </tr>
            </thead>
            <tbody>
              {latestMetrics.map((m, idx) => (
                <tr key={`${m.metric}-${idx}`}>
                  <td>{m.metric}</td>
                  <td>{m.node}</td>
                  <td>{formatValue(m.value)}</td>
                  <td>{m.layer}</td>
                  <td>{brTime(m.timestamp)}</td>
                </tr>
              ))}
              {!latestMetrics.length && (
                <tr>
                  <td colSpan={5} className="muted">
                    Aguardando eventos do backend... (verifique filtros de camada/nó e se o coletor está enviando dados)
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
};

export default Monitor;
