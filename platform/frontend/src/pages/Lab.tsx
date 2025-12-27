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

type Block = {
  id: string;
  name: string;
  layer: string;
  description: string;
  metrics: string[];
  inputs?: string[];
  outputs?: string[];
};

const BLOCKS: Block[] = [
  { id: "ping", name: "Ping", layer: "network", description: "Mede latência, jitter e perda entre dois nós.", metrics: ["latency_ms", "packet_loss_pct", "jitter_ms"] },
  { id: "tcp", name: "TCP (Transporte)", layer: "transport", description: "RTT, retransmissões e throughput TCP.", metrics: ["tcp_rtt_ms", "tcp_retrans_pct", "throughput_mbps", "ss_tcp_states"] },
  { id: "udp", name: "UDP (Transporte)", layer: "transport", description: "Jitter e perda UDP, útil para voz/vídeo.", metrics: ["udp_jitter_ms", "udp_loss_pct"] },
  { id: "http", name: "HTTP", layer: "application", description: "Disponibilidade e latência de requisições HTTP.", metrics: ["http_latency_ms", "http_success_pct"] },
  { id: "dns", name: "DNS", layer: "application", description: "Latência e sucesso de resolução DNS.", metrics: ["dns_latency_ms", "dns_success_pct"] },
  { id: "control", name: "Controlador SDN", layer: "control", description: "Saúde do canal de controle e reconexões.", metrics: ["controller_conn_ok", "controller_latency_ms", "of_channel_reconnects"] },
  { id: "flows", name: "Fluxos OpenFlow", layer: "dataplane", description: "Pacotes/bytes por fluxo no switch.", metrics: ["openflow_flow_packets", "openflow_flow_bytes"] },
  { id: "link", name: "Link L2", layer: "link", description: "Utilização, perda e jitter no enlace.", metrics: ["link_util_pct", "link_loss_pct", "link_jitter_ms", "queue_drops"] },
  { id: "iface", name: "Interface física", layer: "physical", description: "Erros/discards e óticos da interface.", metrics: ["if_errors", "if_discards", "if_optic_rx_dbm", "if_optic_tx_dbm"] },
];

const Lab: React.FC = () => {
  const { data, status } = useEventStream();
  const [layerFilter, setLayerFilter] = useState<string | null>(null);
  const [selectedBlockId, setSelectedBlockId] = useState<string>(BLOCKS[0].id);
  const [workflow, setWorkflow] = useState<string[]>([BLOCKS[0].id]);

  const filteredBlocks = useMemo(() => {
    return layerFilter ? BLOCKS.filter((b) => b.layer === layerFilter) : BLOCKS;
  }, [layerFilter]);

  const selectedBlock = useMemo(() => BLOCKS.find((b) => b.id === selectedBlockId) ?? BLOCKS[0], [selectedBlockId]);

  const latestMetrics = useMemo(() => {
    if (!data?.metrics) return [];
    const direct = data.metrics.filter((m) => selectedBlock.metrics.includes(m.metric));
    const fallback = data.metrics.filter((m) => m.layer === selectedBlock.layer);
    const chosen = direct.length ? direct : fallback;
    return chosen.slice(-50).reverse();
  }, [data, selectedBlock.metrics, selectedBlock.layer]);

  const addToWorkflow = (blockId: string) => {
    setWorkflow((prev) => [...prev, blockId]);
    setSelectedBlockId(blockId);
  };

  const removeFromWorkflow = (idx: number) => {
    setWorkflow((prev) => prev.filter((_, i) => i !== idx));
  };

  const layerCounts = useMemo(() => {
    const counters: Record<string, number> = {};
    workflow.forEach((id) => {
      const b = BLOCKS.find((blk) => blk.id === id);
      if (!b) return;
      counters[b.layer] = (counters[b.layer] ?? 0) + 1;
    });
    return counters;
  }, [workflow]);

  const availableLayers = Array.from(new Set(BLOCKS.map((b) => b.layer)));

  return (
    <div className="page">
      <PageHeader
        title="Lab de Experimentos"
        subtitle={`Monte seu fluxo de coleta/visualização · stream ${status}`}
      />

      <Section title="Visão geral" subtitle="Resumo rápido do workflow atual.">
        <div className="grid-cards">
          <MetricCard title="Blocos" value={workflow.length} subtitle="na sequência" />
          <MetricCard title="Camadas no fluxo" value={Object.keys(layerCounts).length} subtitle="diversidade de camadas" />
          <MetricCard title="Bloco selecionado" value={selectedBlock.name} subtitle={selectedBlock.layer} />
          <MetricCard title="Estado do stream" value={status} subtitle="/stream/events" />
        </div>
      </Section>

      <Section title="Biblioteca de blocos" subtitle="Filtre por camada e escolha o que quer monitorar.">
        <div className="card" style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <button
            onClick={() => setLayerFilter(null)}
            style={{ borderRadius: 10, padding: "6px 10px", border: "1px solid var(--border)", background: !layerFilter ? "rgba(52, 211, 153, 0.15)" : "transparent", color: "var(--text)", cursor: "pointer" }}
          >
            Todas
          </button>
          {availableLayers.map((layer) => {
            const active = layerFilter === layer;
            return (
              <button
                key={layer}
                onClick={() => setLayerFilter(layer)}
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
        <div className="grid-cards" style={{ marginTop: 12 }}>
          {filteredBlocks.map((block) => (
            <div key={block.id} className="card" style={{ border: selectedBlockId === block.id ? "1px solid var(--accent)" : "1px solid var(--border)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <h3>{block.name}</h3>
                  <div className="muted">Camada: {block.layer}</div>
                </div>
                <button
                  onClick={() => addToWorkflow(block.id)}
                  style={{ borderRadius: 10, padding: "6px 10px", border: "1px solid var(--border)", background: "transparent", cursor: "pointer" }}
                >
                  Adicionar
                </button>
              </div>
              <p className="muted" style={{ marginTop: 8 }}>{block.description}</p>
              <div className="muted" style={{ marginTop: 4 }}>Métricas: {block.metrics.join(", ")}</div>
              <button
                onClick={() => setSelectedBlockId(block.id)}
                style={{ marginTop: 8, borderRadius: 10, padding: "6px 10px", border: "1px solid var(--accent)", background: "rgba(56, 189, 248, 0.12)", cursor: "pointer" }}
              >
                Ver detalhes
              </button>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Workflow" subtitle="Ordem dos blocos do experimento.">
        <div className="card" style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {workflow.map((id, idx) => {
            const blk = BLOCKS.find((b) => b.id === id);
            if (!blk) return null;
            return (
              <div key={`${id}-${idx}`} className="card" style={{ minWidth: 180, border: "1px dashed var(--border)", position: "relative" }}>
                <div className="muted">#{idx + 1}</div>
                <strong>{blk.name}</strong>
                <div className="muted">{blk.layer}</div>
                <button
                  onClick={() => setSelectedBlockId(blk.id)}
                  style={{ marginTop: 6, borderRadius: 8, padding: "4px 8px", border: "1px solid var(--accent)", background: "transparent", cursor: "pointer" }}
                >
                  Selecionar
                </button>
                <button
                  onClick={() => removeFromWorkflow(idx)}
                  style={{ marginTop: 6, borderRadius: 8, padding: "4px 8px", border: "1px solid var(--border)", background: "transparent", cursor: "pointer" }}
                >
                  Remover
                </button>
              </div>
            );
          })}
          {!workflow.length && <div className="muted">Nenhum bloco no fluxo ainda.</div>}
        </div>
      </Section>

      <Section title="Detalhes do bloco" subtitle="O que este bloco monitora e quais métricas expõe.">
        <div className="card" style={{ display: "grid", gap: 8 }}>
          <div>
            <h3>{selectedBlock.name}</h3>
            <div className="muted">Camada: {selectedBlock.layer}</div>
          </div>
          <p className="muted">{selectedBlock.description}</p>
          <div className="muted">Métricas: {selectedBlock.metrics.join(", ")}</div>
          {selectedBlock.inputs && <div className="muted">Entradas: {selectedBlock.inputs.join(", ")}</div>}
          {selectedBlock.outputs && <div className="muted">Saídas: {selectedBlock.outputs.join(", ")}</div>}
        </div>
      </Section>

      <Section title="Dados ao vivo do bloco" subtitle="Filtra o stream apenas pelas métricas do bloco selecionado.">
        <div className="card table-card">
          <table>
            <thead>
              <tr>
                <th>Métrica</th>
                <th>No</th>
                <th>Valor</th>
                <th>Layer</th>
                <th>Timestamp (BR)</th>
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
                    Nenhum dado ao vivo para este bloco ainda.
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

export default Lab;
