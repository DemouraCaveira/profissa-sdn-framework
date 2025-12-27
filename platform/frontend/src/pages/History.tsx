import React from "react";
import PageHeader from "../components/PageHeader";
import Section from "../components/Section";

const History: React.FC = () => {
  return (
    <div className="page">
      <PageHeader title="Histórico" subtitle="Eventos, jobs e métricas passadas" />

      <Section title="Eventos recentes">
        <div className="card table-card">
          <table>
            <thead>
              <tr>
                <th>Tipo</th>
                <th>Alvo</th>
                <th>Estado</th>
                <th>Horário</th>
              </tr>
            </thead>
            <tbody>
              {["deploy", "alarme", "job", "backup"].map((tipo, idx) => (
                <tr key={tipo}>
                  <td>{tipo}</td>
                  <td>{idx % 2 === 0 ? "cluster-a" : "sw-core-2"}</td>
                  <td>{idx === 1 ? "warn" : "ok"}</td>
                  <td>há {idx + 5} min</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Relatórios" description="Exportar CSV/JSON dos datasets de métricas">
        <div className="card">
          <div className="muted">Botões de export e filtros (período, domínio, alvo).</div>
        </div>
      </Section>
    </div>
  );
};

export default History;
