import React, { useEffect, useState } from 'react'
import { fetchTopologies, type Topology } from '../api'

export const Topologies: React.FC = () => {
  const [items, setItems] = useState<Topology[]>([])

  useEffect(() => {
    fetchTopologies().then(setItems)
  }, [])

  return (
    <div>
      <h2 className="section-title">Topologias</h2>
      {items.map((t) => (
        <div key={t.id} className="card" style={{ marginBottom: 12 }}>
          <h3>{t.name}</h3>
          <div className="badge">{t.nodes.length} nós • {t.links.length} links</div>
          <div className="topology-graph" style={{ marginTop: 10 }}>
            {t.nodes.map((n) => (
              <div key={n.id} className="topology-node">
                <strong>{n.id}</strong>
                <div>{n.type}</div>
                {n.mgmt_ip && <div>mgmt: {n.mgmt_ip}</div>}
              </div>
            ))}
          </div>
          <div style={{ marginTop: 10 }}>
            {t.links.map((l, idx) => (
              <span key={idx} className="link-chip">
                {l.source} → {l.target}
              </span>
            ))}
          </div>
        </div>
      ))}
      {!items.length && <div className="badge">Nenhuma topologia registrada</div>}
    </div>
  )
}
