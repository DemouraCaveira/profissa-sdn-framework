import React, { useEffect, useMemo, useState } from 'react'
import { API_BASE, fetchExperiments, fetchMetrics, fetchRuns, type MetricRecord, type Run } from '../api'
import { Sparkline } from '../components/Sparkline'

export const Monitor: React.FC = () => {
  const [run, setRun] = useState<Run | null>(null)
  const [metrics, setMetrics] = useState<MetricRecord[]>([])
  const [experimentId, setExperimentId] = useState<string | null>(null)

  useEffect(() => {
    fetchExperiments().then((exps) => {
      if (!exps.length) return
      const first = exps[0]
      setExperimentId(first.id)
      fetchRuns(first.id).then((rs) => {
        if (!rs.length) return
        setRun(rs[rs.length - 1])
      })
    })
  }, [])

  useEffect(() => {
    if (!run) return
    const load = () => fetchMetrics(run.id).then(setMetrics)
    load()
    const id = setInterval(load, 5000)
    return () => clearInterval(id)
  }, [run])

  const grouped = useMemo(() => {
    const byName: Record<string, MetricRecord[]> = {}
    metrics.forEach((m) => {
      if (!byName[m.metric_name]) byName[m.metric_name] = []
      byName[m.metric_name].push(m)
    })
    return byName
  }, [metrics])

  return (
    <div>
      <h2 className="section-title">Monitoramento ao vivo</h2>
      {!run && <div className="badge">Nenhum run selecionado</div>}
      {experimentId && (
        <button
          className="button"
          style={{ marginBottom: 12 }}
          onClick={async () => {
            const res = await fetch(`${API_BASE}/experiments/${experimentId}/run`, { method: 'POST' })
            if (res.ok) {
              const r = (await res.json()) as Run
              setRun(r)
            }
          }}
        >
          Iniciar novo run
        </button>
      )}
      {run && (
        <div className="card" style={{ marginBottom: 12 }}>
          <h3>Run {run.id}</h3>
          <div className="badge">Status: {run.status}</div>
        </div>
      )}

      {Object.entries(grouped).map(([name, values]) => (
        <div key={name} className="card" style={{ marginBottom: 10 }}>
          <h3>{name}</h3>
          <div className="metric-row">
            <div>Último: {values[values.length - 1]?.value ?? '—'}</div>
            <Sparkline values={values.map((v) => v.value)} />
          </div>
        </div>
      ))}

      {!metrics.length && run && <div className="badge">Sem métricas ainda</div>}
    </div>
  )
}
