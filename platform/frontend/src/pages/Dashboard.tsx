import React from "react";
import PageHeader from "../components/PageHeader";
import Section from "../components/Section";
import MetricCard from "../components/MetricCard";
import StatusDot from "../components/StatusDot";

const Dashboard: React.FC = () => {
  return (
    <div className="page">
      <PageHeader title="Painel" subtitle="Visão geral do estado e tráfego" />

      <Section title="Saúde do plano de controle">
        <div className="grid-cards">
          <MetricCard title="Controladores" value="3" subtitle="2 ativos, 1 em espera" />
          <MetricCard title="Switches" value="48" subtitle="spine-leaf" />
          <MetricCard title="Hosts" value="320" subtitle="clusters e bordas" />
          <MetricCard title="Latência média" value="2.1 ms" subtitle="Northbound" />
        </div>
      </Section>

      <Section title="Alertas recentes">
        <div className="card table-card">
          <table>
            <thead>
              <tr>
                <th>Alvo</th>
                <th>Tipo</th>
                <th>Status</th>
                <th>Último evento</th>
              </tr>
            </thead>
            <tbody>
              {["sw-core-1", "gw-edge-2", "host-12"].map((name, idx) => (
                <tr key={name}>
                  <td>{name}</td>
                  <td>{idx === 0 ? "CPU" : idx === 1 ? "Link" : "Ping"}</td>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <StatusDot status={idx === 1 ? "warn" : "ok"} />
                      {idx === 1 ? "Warn" : "OK"}
                    </div>
                  </td>
                  <td>há {idx + 1} min</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Tráfego por domínio" description="Volume agregado nas últimas 24h">
        <div className="grid-cards">
          <MetricCard title="Dataplane" value="12.4 Gbps" />
          <MetricCard title="Control" value="980 Mbps" />
          <MetricCard title="Mgmt" value="120 Mbps" />
          <MetricCard title="Storage" value="1.8 Gbps" />
        </div>
      </Section>
    </div>
  );
};

export default Dashboard;
