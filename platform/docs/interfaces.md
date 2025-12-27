# Interfaces internas e DTOs

## Contratos entre módulos
- **Topologias (REST/JSON)**
  - `POST /api/topologies` cria; `GET /api/topologies/{id}` detalha; `GET /api/topologies` lista.
- **Experimentos (REST/JSON)**
  - `POST /api/experiments` cria; `GET /api/experiments/{id}` detalha; `POST /api/experiments/{id}/run` agenda/aciona execução; `GET /api/experiments/{id}/runs` lista execuções.
- **Orquestrador**
  - Consome DTOs de topologia/experimento e publica eventos de estado (REST callbacks ou fila/mensageria futura). Suporte a WebSocket/SSE para UI.
- **Métricas**
  - Exporta via REST `/api/metrics/definitions` e `/api/runs/{run_id}/metrics`. Coleta via Prometheus client ou arquivos CSV/JSON.

## DTOs básicos (JSON)

### Topologia
```json
{
  "id": "topo-s1",
  "name": "Two hosts and one switch",
  "controller": "ryu",
  "nodes": [
    {"id": "h1", "type": "host", "mgmt_ip": "10.0.0.1"},
    {"id": "h2", "type": "host", "mgmt_ip": "10.0.0.2"},
    {"id": "s1", "type": "switch"}
  ],
  "links": [
    {"source": "h1", "target": "s1", "bandwidth_mbps": 1000, "delay_ms": 1},
    {"source": "h2", "target": "s1", "bandwidth_mbps": 1000, "delay_ms": 1}
  ],
  "meta": {"env": "lab"}
}
```

### Experimento
```json
{
  "id": "exp-latency",
  "topology_id": "topo-s1",
  "name": "Latency ping",
  "description": "Latency baseline",
  "hypotheses": "RTT under 5ms",
  "traffic": [
    {"generator": "ping", "src": "h1", "dst": "h2", "protocol": "icmp", "duration_sec": 30}
  ],
  "metrics": {
    "metrics": ["latency_ms", "packet_loss_pct", "jitter_ms"],
    "interval_sec": 5,
    "labels": ["experiment_id", "run_id", "topology_id", "src", "dst"]
  },
  "duration_sec": 60,
  "tags": ["example", "latency"],
  "template_version": "0.1.0"
}
```

### Cenário de tráfego
```json
{
  "generator": "iperf",
  "src": "h1",
  "dst": "h2",
  "protocol": "tcp",
  "rate": "100Mbps",
  "duration_sec": 30,
  "params": {"parallel": 1}
}
```

### Conjunto de métricas
```json
{
  "metrics": ["latency_ms", "throughput_mbps", "packet_loss_pct"],
  "interval_sec": 5,
  "labels": ["experiment_id", "run_id", "topology_id", "src", "dst"]
}
```

## Templates de experimento (JSON/YAML)
- Contêm: versão do template, topologia completa, lista de experimentos que referenciam a topologia, tráfego e métricas.
- Podem ser serializados em JSON ou YAML. Exemplo YAML em `platform/experiments/example_experiment.yaml`.
