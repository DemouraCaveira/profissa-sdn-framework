import React from "react";
import PageHeader from "../components/PageHeader";
import Section from "../components/Section";

const Topology: React.FC = () => {
  return (
    <div className="page">
      <PageHeader
        title="Topologia"
        subtitle="Visualização interativa dos domínios e links"
      />

      <Section
        title="Mapa lógico"
        description="Carregue a topologia a partir do backend e permita zoom/pan. Placeholder simples por enquanto."
      >
        <div
          className="card"
          style={{
            height: 420,
            display: "grid",
            placeItems: "center",
            borderStyle: "dashed",
            borderColor: "var(--border)",
          }}
        >
          <div className="muted">Canvas/graph aqui (D3/Sigma/Vis)</div>
        </div>
      </Section>

      <Section title="Resumo de links">
        <div className="grid-cards">
          <div className="card">
            <h3>Spine/Leaf</h3>
            <div className="muted">128 links · 1 alerta</div>
          </div>
          <div className="card">
            <h3>Edge</h3>
            <div className="muted">32 links · 0 alerta</div>
          </div>
          <div className="card">
            <h3>WAN/MPLS</h3>
            <div className="muted">8 links · 1 alerta</div>
          </div>
        </div>
      </Section>
    </div>
  );
};

export default Topology;
