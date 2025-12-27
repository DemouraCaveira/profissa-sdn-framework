import React from "react";
import PageHeader from "../components/PageHeader";
import Section from "../components/Section";

const Experiments: React.FC = () => {
  return (
    <div className="page">
      <PageHeader
        title="Experimentos"
        subtitle="Configuração de labs e reprodução de cenários"
      />

      <Section title="Experimentos ativos">
        <div className="card table-card">
          <table>
            <thead>
              <tr>
                <th>Nome</th>
                <th>Topo</th>
                <th>Estado</th>
                <th>Início</th>
              </tr>
            </thead>
            <tbody>
              {["Docker lab A", "Topo BGP", "Stress L2"].map((name, idx) => (
                <tr key={name}>
                  <td>{name}</td>
                  <td>{idx === 0 ? "docker_lab_topology" : idx === 1 ? "bgp" : "l2"}</td>
                  <td>{idx === 2 ? "Parado" : "Rodando"}</td>
                  <td>há {idx + 2} min</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section
        title="Adicionar experimento"
        description="Formulário placeholder para acionar backend"
      >
        <div className="card">
          <div className="muted">Form aqui (nome, topo, parâmetros).</div>
        </div>
      </Section>
    </div>
  );
};

export default Experiments;
