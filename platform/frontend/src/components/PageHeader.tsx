import React from "react";

type PageHeaderProps = {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
};

const PageHeader: React.FC<PageHeaderProps> = ({ title, subtitle, right }) => (
  <div className="topbar">
    <div>
      <div className="tag">SDN Platform</div>
      <h1 style={{ margin: "6px 0 4px", fontSize: 26 }}>{title}</h1>
      {subtitle ? <div className="muted">{subtitle}</div> : null}
    </div>
    {right ? <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>{right}</div> : null}
  </div>
);

export default PageHeader;
