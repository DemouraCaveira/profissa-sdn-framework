import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import "./styles/theme.css";
import AppShell from "./components/AppShell";
import Dashboard from "./pages/Dashboard";
import Topology from "./pages/Topology";
import Experiments from "./pages/Experiments";
import Monitor from "./pages/Monitor";
import History from "./pages/History";
import Lab from "./pages/Lab";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <BrowserRouter>
      <AppShell>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/topology" element={<Topology />} />
          <Route path="/experiments" element={<Experiments />} />
          <Route path="/lab" element={<Lab />} />
          <Route path="/monitor" element={<Monitor />} />
          <Route path="/history" element={<History />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </AppShell>
    </BrowserRouter>
  </React.StrictMode>
);
