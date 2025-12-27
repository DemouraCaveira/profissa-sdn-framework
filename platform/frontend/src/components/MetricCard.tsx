import React from "react";

type MetricCardProps = {
  title: string;
  value: string | number;
  subtitle?: string;
};

const MetricCard: React.FC<MetricCardProps> = ({ title, value, subtitle }) => (
  <div className="card">
    <h3>{title}</h3>
    <div className="value">{value}</div>
    {subtitle ? <div className="muted">{subtitle}</div> : null}
  </div>
);

export default MetricCard;
