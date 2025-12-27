import React from "react";
import PageHeader from "../components/PageHeader";
import Section from "../components/Section";
import MetricCard from "../components/MetricCard";
import StatusDot from "../components/StatusDot";

const Monitor: React.FC = () => {
  return (
    <div className="page">
      <PageHeader title="Monitor" subtitle="Métricas em tempo real e alertas" />

      <Section title="KPIs ao vivo">
        <div className="grid-cards">
          <MetricCard title="Pacotes/s" value="1.2M" />
          <MetricCard title="Perda" value="0.02%" />
          <MetricCard title="Jitter" value="0.7 ms" />
          <MetricCard title="Flows" value="12.5k" />
        </div>
      </Section>

      <Section title="Sessões OpenFlow">
        <div className="card table-card">
          <table>
            <thead>
              <tr>
                <th>Switch</th>
                <th>Ctrl</th>
                <th>Estado</th>
                <th>Latency</th>
              </tr>
            </thead>
            <tbody>
              {["sw-core-1", "sw-core-2", "sw-edge-1"].map((name, idx) => (
                <tr key={name}>
                  <td>{name}</td>
                  <td>c{idx + 1}</td>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <StatusDot status={idx === 2 ? "warn" : "ok"} />
                      {idx === 2 ? "Warn" : "OK"}
                    </div>
                  </td>
                  <td>{idx === 2 ? "6 ms" : "3 ms"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Links críticos">
        <div className="card table-card">
          <table>
            <thead>
              <tr>
                <th>Link</th>
                <th>Uso</th>
                <th>Erro</th>
                <th>Último evento</th>
              </tr>
            </thead>
            <tbody>
              {["spine1-leaf3", "edge-wan1", "leaf7-host12"].map((name, idx) => (
                <tr key={name}>
                  <td>{name}</td>
                  <td>{idx === 1 ? "82%" : "46%"}</td>
                  <td>{idx === 2 ? "CRC" : "-"}</td>
                  <td>há {idx + 4} min</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
};

export default Monitor;
