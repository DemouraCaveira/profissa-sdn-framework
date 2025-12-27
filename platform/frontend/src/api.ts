export const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000'

export type TopologyNode = {
  id: string
  type: 'host' | 'switch' | 'controller'
  mgmt_ip?: string
  image?: string
}

export type TopologyLink = {
  source: string
  target: string
  bandwidth_mbps?: number
  delay_ms?: number
  loss_pct?: number
}

export type Topology = {
  id: string
  name: string
  controller?: string
  nodes: TopologyNode[]
  links: TopologyLink[]
}

export type TrafficPattern = {
  generator: 'iperf' | 'ping' | 'custom'
  src: string
  dst: string
  protocol: 'tcp' | 'udp' | 'icmp'
  rate?: string
  duration_sec: number
}

export type MetricsSet = {
  metrics: string[]
  interval_sec?: number
}

export type Experiment = {
  id: string
  topology_id: string
  name: string
  description?: string
  traffic: TrafficPattern[]
  metrics: MetricsSet
  duration_sec: number
}

export type RunStatus = 'CREATED' | 'SCHEDULED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED'

export type Run = {
  id: string
  experiment_id: string
  topology_id: string
  status: RunStatus
  started_at?: string
  finished_at?: string
}

export type MetricRecord = {
  run_id: string
  metric_name: string
  value: number
  timestamp: string
  labels: Record<string, string>
}

async function safeFetch<T>(path: string, fallback: T): Promise<T> {
  try {
    const res = await fetch(`${API_BASE}${path}`)
    if (!res.ok) return fallback
    return (await res.json()) as T
  } catch (e) {
    return fallback
  }
}

export const fetchTopologies = () => safeFetch<Topology[]>('/topologies', [])
export const fetchExperiments = () => safeFetch<Experiment[]>('/experiments', [])
export const fetchRuns = (experimentId: string) => safeFetch<Run[]>(`/experiments/${experimentId}/runs`, [])
export const fetchMetrics = (runId: string) => safeFetch<MetricRecord[]>(`/metrics/runs/${runId}`, [])
