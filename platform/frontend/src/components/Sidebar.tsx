import React from 'react'
import { NavLink } from 'react-router-dom'

const links = [
  { to: '/', label: 'Dashboard' },
  { to: '/topologies', label: 'Topologias' },
  { to: '/experiments', label: 'Experimentos' },
  { to: '/monitor', label: 'Monitoramento' },
  { to: '/history', label: 'Histórico' },
]

export const Sidebar: React.FC = () => (
  <aside className="sidebar">
    <nav>
      {links.map((link) => (
        <NavLink
          key={link.to}
          to={link.to}
          className={({ isActive }) => (isActive ? 'active' : '')}
          end={link.to === '/'}
        >
          {link.label}
        </NavLink>
      ))}
    </nav>
  </aside>
)
