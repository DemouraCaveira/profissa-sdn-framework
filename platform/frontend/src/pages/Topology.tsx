import React, { useMemo } from "react";
import PageHeader from "../components/PageHeader";
import Section from "../components/Section";
import { useEventStream } from "../hooks/useEventStream";

const Topology: React.FC = () => {
  const { data, status } = useEventStream();

  const nodes = useMemo(() => data?.topology?.nodes ?? [], [data]);
  const links = useMemo(() => data?.topology?.links ?? [], [data]);

  const grouped = useMemo(() => {
    const buckets: Record<string, any[]> = { controller: [], switch: [], host: [], other: [] };
    nodes.forEach((n: any) => {
      const t = (n.type || n.role || "other").toString();
      if (t.includes("control")) buckets.controller.push(n);
      else if (t.includes("witch") || t === "switch") buckets.switch.push(n);
      else if (t.includes("host")) buckets.host.push(n);
      else buckets.other.push(n);
    });
    return buckets;
  }, [nodes]);

  return (
    <div className="page">
      <PageHeader
        title="Topologia"
        subtitle={`Visualização interativa · stream ${status}`}
      />

      <Section
        title="Mapa lógico"
        description="Visualização simplificada da topologia atual (hosts, switches e controlador)."
      >
        <div className="card" style={{ display: "grid", gap: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
            <div className="card" style={{ border: "1px dashed var(--border)" }}>
              <h3>Controlador</h3>
              {grouped.controller.length ? (
                grouped.controller.map((n, idx) => (
                  <div key={`ctl-${idx}`} className="muted">{n.id || n.name}</div>
                ))
              ) : (
                <div className="muted">Nenhum controlador detectado</div>
              )}
            </div>
            <div className="card" style={{ border: "1px dashed var(--border)" }}>
              <h3>Switches</h3>
              {grouped.switch.length ? (
                grouped.switch.map((n, idx) => (
                  <div key={`sw-${idx}`} className="muted">{n.id || n.name}</div>
                ))
              ) : (
                <div className="muted">Nenhum switch detectado</div>
              )}
            </div>
            <div className="card" style={{ border: "1px dashed var(--border)" }}>
              <h3>Hosts</h3>
              {grouped.host.length ? (
                grouped.host.map((n, idx) => (
                  <div key={`host-${idx}`} className="muted">{n.id || n.name}</div>
                ))
              ) : (
                <div className="muted">Nenhum host detectado</div>
              )}
            </div>
            {grouped.other.length > 0 && (
              <div className="card" style={{ border: "1px dashed var(--border)" }}>
                <h3>Outros</h3>
                {grouped.other.map((n, idx) => (
                  <div key={`other-${idx}`} className="muted">{n.id || n.name}</div>
                ))}
              </div>
            )}
          </div>

          <div className="muted" style={{ borderTop: "1px solid var(--border)", paddingTop: 8 }}>
            Links ({links.length}):
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 8 }}>
            {links.length ? (
              links.map((ln: any, idx: number) => (
                <div key={`ln-${idx}`} className="card" style={{ padding: "8px 10px" }}>
                  <div><strong>{ln.source}</strong> → <strong>{ln.target}</strong></div>
                  {ln.bandwidth && <div className="muted">bw: {ln.bandwidth}</div>}
                  {ln.delay && <div className="muted">delay: {ln.delay}</div>}
                  {ln.loss && <div className="muted">loss: {ln.loss}</div>}
                </div>
              ))
            ) : (
              <div className="muted">Nenhum link informado</div>
            )}
          </div>
        </div>
      </Section>

      <Section title="Resumo de links">
        <div className="grid-cards">
          <div className="card">
            <h3>Links totais</h3>
            <div className="muted">{links.length || "-"}</div>
          </div>
          <div className="card">
            <h3>Nós</h3>
            <div className="muted">{nodes.length || "-"}</div>
          </div>
          <div className="card">
            <h3>Stream</h3>
            <div className="muted">{status}</div>
          </div>
        </div>
      </Section>
    </div>
  );
};

export default Topology;
