import React, { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";

const nav = [
  { path: "/dashboard", label: "Dashboard" },
  { path: "/topology", label: "Topologia" },
  { path: "/experiments", label: "Experimentos" },
  { path: "/settings", label: "Configurações" },
  { path: "/lab", label: "Lab" },
  { path: "/monitor", label: "Monitor" },
  { path: "/history", label: "Histórico" },
];

const AppShell: React.FC<React.PropsWithChildren> = ({ children }) => {
  const location = useLocation();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("netops.sidebarCollapsed");
      setSidebarCollapsed(raw === "1");
    } catch (_) {
      // ignore
    }
  }, []);

  const toggleSidebar = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("netops.sidebarCollapsed", next ? "1" : "0");
      } catch (_) {
        // ignore
      }
      return next;
    });
  };

  return (
    <div className={`main-shell ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
      <aside className="sidebar">
        <div className="logo-row">
          <div className="logo">NetOps Studio</div>
          <button className="btn" onClick={toggleSidebar} type="button" aria-label="Ocultar barra lateral">
            Ocultar
          </button>
        </div>
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
      <main className="content">
        <div className="shell-toolbar">
          <button className="btn" onClick={toggleSidebar} type="button" aria-label={sidebarCollapsed ? "Mostrar barra lateral" : "Ocultar barra lateral"}>
            {sidebarCollapsed ? "Mostrar menu" : "Ocultar menu"}
          </button>
        </div>
        {children}
      </main>
    </div>
  );
};

export default AppShell;
