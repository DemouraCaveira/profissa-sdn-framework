import React from "react";

type StatusDotProps = {
  status: "ok" | "warn" | "down";
};

const colors: Record<StatusDotProps["status"], string> = {
  ok: "var(--success)",
  warn: "var(--warn)",
  down: "var(--danger)",
};

const StatusDot: React.FC<StatusDotProps> = ({ status }) => (
  <span
    style={{
      display: "inline-block",
      width: 10,
      height: 10,
      borderRadius: "50%",
      background: colors[status],
      boxShadow: `0 0 0 4px ${colors[status]}22`,
    }}
    aria-label={`status-${status}`}
  />
);

export default StatusDot;
