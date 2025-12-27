import React from "react";

const PageHeader: React.FC<{ title: string; subtitle?: string }> = ({ title, subtitle }) => (
  <div className="topbar">
    <div>
      <div className="tag">SDN Platform</div>
      <h1 style={{ margin: "6px 0 4px", fontSize: 26 }}>{title}</h1>
      {subtitle ? <div className="muted">{subtitle}</div> : null}
    </div>
  </div>
);

export default PageHeader;
