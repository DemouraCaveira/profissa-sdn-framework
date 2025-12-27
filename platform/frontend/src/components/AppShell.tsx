import React from "react";
import { NavLink, useLocation } from "react-router-dom";

const nav = [
  { path: "/dashboard", label: "Dashboard" },
  { path: "/topology", label: "Topologia" },
  { path: "/experiments", label: "Experimentos" },
  { path: "/monitor", label: "Monitor" },
  { path: "/history", label: "Histórico" },
];

const AppShell: React.FC<React.PropsWithChildren> = ({ children }) => {
  const location = useLocation();

  return (
    <div className="main-shell">
      <aside className="sidebar">
        <div className="logo">NetOps Studio</div>
        <nav>
          {nav.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={`nav-item ${location.pathname === item.path ? "active" : ""}`}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="content">{children}</main>
    </div>
  );
};

export default AppShell;
