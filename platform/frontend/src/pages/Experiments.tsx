import React, { useEffect, useState } from 'react'
import { fetchExperiments, fetchRuns, type Experiment, type Run } from '../api'

export const Experiments: React.FC = () => {
  const [experiments, setExperiments] = useState<Experiment[]>([])
  const [runs, setRuns] = useState<Record<string, Run[]>>({})

  useEffect(() => {
    fetchExperiments().then((exps) => {
      setExperiments(exps)
      exps.forEach((e) => fetchRuns(e.id).then((rs) => setRuns((prev) => ({ ...prev, [e.id]: rs }))))
    })
  }, [])

  return (
    <div>
      <h2 className="section-title">Experimentos</h2>
      {experiments.map((e) => (
        <div key={e.id} className="card" style={{ marginBottom: 12 }}>
          <h3>{e.name}</h3>
          <div className="badge">Topo: {e.topology_id}</div>
          <p>{e.description || 'Sem descrição'}</p>
          <div><strong>Duração:</strong> {e.duration_sec}s</div>
          <div style={{ marginTop: 8 }}>
            <strong>Tráfego:</strong>{' '}
            {e.traffic.map((t, idx) => (
              <span key={idx} className="link-chip">{t.generator} {t.src}→{t.dst} ({t.protocol})</span>
            ))}
          </div>
          <div style={{ marginTop: 8 }}>
            <strong>Métricas:</strong> {e.metrics.metrics.join(', ')} @ {e.metrics.interval_sec ?? 5}s
          </div>
          <div style={{ marginTop: 10 }}>
            <strong>Runs:</strong> {(runs[e.id] || []).length}
          </div>
          <div style={{ marginTop: 6 }}>
            {(runs[e.id] || []).map((r) => (
              <span key={r.id} className="link-chip">{r.status}</span>
            ))}
          </div>
        </div>
      ))}
      {!experiments.length && <div className="badge">Nenhum experimento cadastrado</div>}
    </div>
  )
}
