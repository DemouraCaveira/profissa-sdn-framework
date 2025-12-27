import React from "react";

const Section: React.FC<{ title: string; description?: string; children: React.ReactNode }> = ({
  title,
  description,
  children,
}) => (
  <div className="section">
    <div>
      <h2 style={{ margin: "0 0 6px", fontSize: 20 }}>{title}</h2>
      {description ? <div className="muted">{description}</div> : null}
    </div>
    {children}
  </div>
);

export default Section;
