# Interfaces internas e DTOs

> Nota: a referência completa e atualizada está no OpenAPI do backend (FastAPI): `GET /openapi.json` e UI em `/docs`.

## Contratos entre módulos
- **Topologias (REST/JSON)**
  - `POST /topologies` cria; `GET /topologies/{id}` detalha; `GET /topologies` lista.
- **Configurações (multi-ambiente) (REST/JSON)**
  - `GET /configs` lista configs salvas.
  - `GET /configs/active` mostra a config ativa.
  - `GET /configs/{id}` recupera uma config.
  - `POST /configs` cria uma config (suporta `set_active=true`).
  - `POST /configs/{id}/activate` ativa uma config.
  - `DELETE /configs/{id}` remove uma config.
- **Experimentos (REST/JSON)**
  - `POST /experiments` cria; `GET /experiments/{id}` detalha; `POST /experiments/{id}/run` agenda/aciona execução; `GET /experiments/{id}/runs` lista execuções.
- **Orquestrador**
  - Consome DTOs de topologia/experimento e publica eventos de estado (REST callbacks ou fila/mensageria futura). Suporte a WebSocket/SSE para UI.
- **Métricas**
  - Definições: `GET /metrics/definitions`.
  - Ingestão: `POST /metrics/samples` (1 ou N amostras com `timestamp`, `node`, `layer`, `metric`, `value`, `details`, `labels`).
  - Consulta: `POST /metrics/query` (filtros por nomes, nós, camadas, janela temporal, limite).
  - Últimos valores: `GET /metrics/latest?metric=&node=&layer=`.
  - Exportação: `GET /metrics/export?layer=network` (retorna JSONL da camada).
  - Coleta sob demanda: `POST /metrics/collect?mode=synthetic|real`.
  - Camadas suportadas (OSI L0–L7 + SDN):
    - `service`, `physical`, `link`, `network`, `transport`, `session`, `presentation`, `application`, `control`, `dataplane`.
  - Stream SSE: `GET /stream/events` (snapshot com topologia, runs e ~200 métricas recentes).

## Autenticação (API Key)
- Se `API_KEY` estiver configurado no backend, endpoints de escrita exigem header `X-API-Key: <chave>`.
- O frontend usa `VITE_API_KEY` para enviar esse header.

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

## Configuração central da plataforma
- Arquivo: `platform/experiments/platform_config.json` (ou sobrescreva com `PLATFORM_CONFIG_PATH`).
- Campos: `controllers` (lista com id/tipo/api/openflow/auth), `default_controller`, `nodes` (hosts/switches/controllers), `links`, `flow_templates`, `traffic_profiles`, `metric_plan`, `environment` (docker/mininet), `metric_layers` (flags por camada), `layer_descriptions`, `metadata`.
- `metric_plan.metric_layers` mapeia cada métrica ao layer correspondente (ex.: `"latency_ms": "network"`).
- `metric_layers` (raiz) habilita/desabilita coleta por camada (ex.: `"link": false` para ignorar L2).
- O bootstrap da API lê esse arquivo na inicialização e pré-carrega topologia, fluxos e métricas disponíveis.

### Persistência (arquivos)
- Métricas brutas (por camada): `raw/metrics_{layer}.jsonl`
- Configurações (multi-ambiente): `temp/configs/` (com ponteiro para ativa)
- Experimentos/runs/artefatos: `temp/experiments/`

## Stream SSE (/stream/events)
- Tipo de evento: `snapshot`.
- Payload:
```json
{
  "type": "snapshot",
  "generated_at": "2024-01-01T12:00:00Z",
  "topology": {"id": "topo-1", "nodes": [], "links": []},
  "metrics": [
    {"timestamp": "...", "node": "h1", "layer": "network", "metric_name": "latency_ms", "value": 1.2, "details": {}, "labels": {}}
  ],
  "runs": []
}
```
- Inclui ~200 métricas recentes; topologia e runs ativos; usado pela UI em Monitor e Lab.

## Esquemas de métricas (importante)
- `MetricSample` (ingestão via `POST /metrics/samples`) usa o campo `metric`.
- `MetricRecord` (armazenamento/consulta/UI) usa o campo `metric_name`.

## Templates de experimento (JSON/YAML)
- Contêm: versão do template, topologia completa, lista de experimentos que referenciam a topologia, tráfego e métricas.
- Podem ser serializados em JSON ou YAML.
