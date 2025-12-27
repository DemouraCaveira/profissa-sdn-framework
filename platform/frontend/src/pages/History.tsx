import React, { useEffect, useState } from 'react'
import { fetchExperiments, fetchRuns, type Run } from '../api'

export const History: React.FC = () => {
  const [runs, setRuns] = useState<Run[]>([])

  useEffect(() => {
    fetchExperiments().then((exps) => {
      Promise.all(exps.map((e) => fetchRuns(e.id))).then((lists) => setRuns(lists.flat()))
    })
  }, [])

  return (
    <div>
      <h2 className="section-title">Histórico</h2>
      <table className="table">
        <thead>
          <tr>
            <th>Run</th>
            <th>Experimento</th>
            <th>Status</th>
            <th>Início</th>
            <th>Fim</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((r) => (
            <tr key={r.id}>
              <td>{r.id}</td>
              <td>{r.experiment_id}</td>
              <td>{r.status}</td>
              <td>{r.started_at || '—'}</td>
              <td>{r.finished_at || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!runs.length && <div className="badge">Nenhuma execução registrada</div>}
    </div>
  )
}
