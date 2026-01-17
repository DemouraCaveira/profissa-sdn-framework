import React from "react";

type SectionProps = {
  title: string;
  description?: string;
  subtitle?: string;
  children: React.ReactNode;
};

const Section: React.FC<SectionProps> = ({ title, description, subtitle, children }) => (
  <div className="section">
    <div>
      <h2 style={{ margin: "0 0 6px", fontSize: 20 }}>{title}</h2>
      {description || subtitle ? <div className="muted">{description ?? subtitle}</div> : null}
    </div>
    {children}
  </div>
);

export default Section;
