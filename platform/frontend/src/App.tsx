import React from 'react'
import { Routes, Route } from 'react-router-dom'
import { Sidebar } from './components/Sidebar'
import { Header } from './components/Header'
import { Dashboard } from './pages/Dashboard'
import { Topologies } from './pages/Topologies'
import { Experiments } from './pages/Experiments'
import { Monitor } from './pages/Monitor'
import { History } from './pages/History'

const App: React.FC = () => {
  return (
    <div className="app-shell">
      <Header />
      <Sidebar />
      <main className="main">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/topologies" element={<Topologies />} />
          <Route path="/experiments" element={<Experiments />} />
          <Route path="/monitor" element={<Monitor />} />
          <Route path="/history" element={<History />} />
        </Routes>
      </main>
    </div>
  )
}

export default App
