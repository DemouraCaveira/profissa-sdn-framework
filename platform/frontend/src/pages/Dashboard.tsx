import React, { useEffect, useState } from 'react'
import { fetchExperiments, fetchRuns, fetchTopologies, type Experiment, type Run, type Topology } from '../api'
import { Sparkline } from '../components/Sparkline'

export const Dashboard: React.FC = () => {
  const [topologies, setTopologies] = useState<Topology[]>([])
  const [experiments, setExperiments] = useState<Experiment[]>([])
  const [runs, setRuns] = useState<Run[]>([])

  useEffect(() => {
    fetchTopologies().then(setTopologies)
    fetchExperiments().then((exps) => {
      setExperiments(exps)
      Promise.all(exps.map((e) => fetchRuns(e.id))).then((runsLists) => setRuns(runsLists.flat()))
    })
  }, [])

  const running = runs.filter((r) => r.status === 'RUNNING').length
  const completed = runs.filter((r) => r.status === 'COMPLETED').length
  const failed = runs.filter((r) => r.status === 'FAILED').length

  const sampleValues = runs.slice(0, 10).map((r, i) => (r.status === 'COMPLETED' ? 1 : r.status === 'FAILED' ? 2 : 0.5 + i * 0))

  return (
    <div>
      <h2 className="section-title">Visão geral</h2>
      <div className="card-grid">
        <div className="card">
          <h3>Topologias</h3>
          <div className="badge">{topologies.length} registradas</div>
        </div>
        <div className="card">
          <h3>Experimentos</h3>
          <div className="badge">{experiments.length} prontos</div>
        </div>
        <div className="card">
          <h3>Execuções</h3>
          <div>Ativos: {running}</div>
          <div>Concluídos: {completed}</div>
          <div>Falhados: {failed}</div>
        </div>
        <div className="card">
          <h3>Saúde recente</h3>
          <Sparkline values={sampleValues.length ? sampleValues : [0, 1, 0.5, 1]} />
        </div>
      </div>
    </div>
  )
}
