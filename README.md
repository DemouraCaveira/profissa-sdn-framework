# profissa-sdn-framework

![Coverage](https://img.shields.io/badge/coverage-82%25-brightgreen)

Plataforma modular e programável para orquestrar e monitorar experimentos em Redes SDN. Inclui API RESTful (FastAPI), UI web (Vite + React) e componentes para coleta estruturada de métricas, com foco em reprodutibilidade, extensibilidade e dados ao vivo via SSE.

## Stack
- Backend: Python 3.11+, FastAPI (REST + SSE), modular para controladores SDN (ONOS, OpenDaylight, Ryu, Floodlight) escolhidos pelo usuário.
- Frontend: Vite + React (TS) consumindo REST/SSE.
- Ambiente de rede: Mininet e/ou containers Docker, orquestrados preferencialmente com Docker Compose (Kubernetes opcional futuro).
- Observabilidade: métricas gravadas em JSONL por camada, SSE para stream ao vivo, backfill automático ao reiniciar, Prometheus client opcional.
- Qualidade: pytest (+pytest-asyncio) com cobertura mínima 70%, ruff, black, isort. CI via GitHub Actions.

## Estrutura de pastas
- `platform/backend/` – FastAPI com SSE, coleta real/sintética, ingestão/exportação de métricas.
- `platform/frontend/` – Vite + React com páginas Dashboard, Topologia, Monitor, Lab, Histórico, Configurações e Experimentos.
- `platform/infra/` – scripts/manifests de infraestrutura (Docker Compose, etc.).
- `platform/docs/` – documentacao tecnica e diagramas.
- `platform/experiments/` – exemplos e templates de experimentos.
- `gr-netmon/` – blocos GNU Radio/netmon usados para cenarios SDR/SDN.
- `raw/` – dados brutos exportados (CSV/JSON de monitoramento).
- `temp/` – artefatos persistidos (configs, experimentos e execuções).
- `tests/` – suite de testes pytest.
- `monitor.py` / `monitor copy.py` – utilitarios de monitoramento e probes (ping/TCP/UDP, opcional throughput/captura).
- `requirements.txt` / `requirements-dev.txt` – dependencias runtime e de desenvolvimento.
- `VERSION` – versionamento semantico (atual 0.1.0).
- `LICENSE` – licenca MIT.

## Requisitos
- Python 3.11+ (recomendado).
- Node.js 20+ (para frontend). Defina `VITE_API_BASE` para apontar para o backend (ex.: `http://localhost:8000`).
- Docker/Docker Compose para cenarios conteinerizados ou Mininet instalado localmente.

## Como instalar (backend/dev)
```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt
```

## Como rodar testes
```bash
pytest
```

### Testes da API RESTful
- Para focar só na API (evitando os `addopts` de cobertura global):
```bash
PYTHONPATH=$(pwd) .venv/bin/pytest tests/test_api_restful.py -q -o addopts=""
```
Os testes inicializam o app com um `platform_config.json` temporário, validam bootstrap, CRUD de topologias/experimentos, início de runs e ciclo de fluxos.

## Lint e formatacao
```bash
ruff check . --exit-zero   # nao bloqueante (ajuste para strict quando desejar)
black .
isort .
```

## Frontend (quando for iniciar a UI)
```bash
cd platform/frontend
npm install
npm run dev   # desenvolvimento
npm run build # producao
```

### Variáveis do frontend
- `VITE_API_BASE` (ex.: `http://localhost:8000`)
- `VITE_API_KEY` (necessário para ações de escrita, se o backend estiver com API key habilitada)

## API RESTful (backend)
- Config central: `platform/experiments/platform_config.json` (ou altere via `PLATFORM_CONFIG_PATH`). Contém ambiente, controladores, nós/links, perfis de tráfego, plano de métricas, fluxos e flags por camada (`metric_layers`).
- Rodar o servidor:
```bash
PYTHONPATH=$(pwd) .venv/bin/uvicorn platform.backend.api.app:app --host 0.0.0.0 --port 8000
# opcional: export API_KEY=suachave para exigir header X-API-Key
# coleta contínua e backfill automático (recomendado para UI):
PLATFORM_CONFIG_PATH=platform/experiments/platform_config.json REAL_COLLECTION=1 AUTO_COLLECT_INTERVAL=5 \
PYTHONPATH=$(pwd) .venv/bin/python -m uvicorn platform.backend.api.app:app --host 0.0.0.0 --port 8000
```
- Endpoints principais (sem prefixo `/api`):
	- `GET /health`
	- Topologias: `POST/GET/PUT/DELETE /topologies`, `GET /topologies/{id}`
	- Configurações (multi-ambiente):
		- `GET /configs`, `GET /configs/active`, `GET /configs/{id}`
		- `POST /configs` (cria; suporta `set_active`), `POST /configs/{id}/activate`, `DELETE /configs/{id}`
	- Experimentos: `POST/GET/PUT/DELETE /experiments`, `GET /experiments/{id}`, `POST /experiments/{id}/run`, `GET /experiments/{id}/runs`, `GET /runs/{run_id}`
	- Métricas (novas rotas):
		- `GET /metrics/definitions`
		- `POST /metrics/samples` (ingestão JSONL-like; aceita 1 ou N amostras)
		- `POST /metrics/query` (filtros por `metric_names`, `nodes`, `layers`, `start_time`, `end_time`, `limit`)
		- `GET /metrics/latest` (snapshot mais recente por métrica/nó/camada)
		- `GET /metrics/export?layer=network` (exporta texto JSONL do arquivo bruto por camada)
		- `POST /metrics/collect` (coleta sob demanda; `mode=synthetic|real`; requer API key se configurada)
		- `GET /stream/events` (SSE com topologia, runs e últimas ~200 métricas)
	- Fluxos: `POST /flows`, `GET /flows`, `DELETE /flows/{id}`
- Teste rápido (curl):
```bash
curl http://localhost:8000/health
curl http://localhost:8000/topologies
```

### Passo a passo para testar a API manualmente
1. Ative o venv (se ainda não estiver):
```bash
cd /home/jon/profissa-sdn-framework
source .venv/bin/activate
```
2. Suba a API em um terminal e deixe rodando:
```bash
PYTHONPATH=$(pwd) uvicorn platform.backend.api.app:app --host 0.0.0.0 --port 8000
```
	 - Para usar chave: `export API_KEY=suachave` e envie header `X-API-Key: suachave` nos requests.
	 - Para outro config: `export PLATFORM_CONFIG_PATH=/caminho/platform_config.json` antes de iniciar.
3. Em outro terminal, faça chamadas (instale curl com `sudo apt install -y curl` se não tiver):
```bash
curl http://localhost:8000/health
curl http://localhost:8000/topologies
curl http://localhost:8000/flows
curl http://localhost:8000/metrics/definitions
curl -X POST http://localhost:8000/metrics/collect -H "X-API-Key: $API_KEY"
curl http://localhost:8000/metrics/export?layer=network
curl http://localhost:8000/stream/events
```
4. Se preferir Python em vez de curl:
```bash
PYTHONPATH=$(pwd) .venv/bin/python - <<'PY'
import httpx
for path in ["health", "topologies", "flows", "metrics/definitions"]:
		r = httpx.get(f"http://localhost:8000/{path}")
		print(path, r.status_code, r.text)
PY
```

## CI/CD
Pipeline GitHub Actions em `.github/workflows/ci.yml`: instala deps, roda ruff check e pytest com cobertura minima de 70%.

## Roadmap curto
- UI pronta para navegação: Dashboard, Topologia, Monitor (SSE + filtros por camada/nó), Lab (blocos/pipelines), Histórico (placeholder).
- Backend com SSE, coleta real/sintética, export/import JSONL, bootstrap de topologia/fluxos via config, backfill automático.
- Próximos passos: visualização gráfica da topologia, CRUD completo via UI, drag-and-drop no Lab, integração com TSDB, controles start/stop de experimento.

## Camadas de métricas (referência rápida)

OSI (L0–L7) + planos SDN:
- `service` (L0): SLIs/SLOs, disponibilidade E2E.
- `physical` (L1): contadores de interface/PHY (erros, descartes, etc.).
- `link` (L2): utilização de enlace/filas, drops, jitter/loss no nível de link.
- `network` (L3): latência ICMP, perda, reachability.
- `transport` (L4): TCP/UDP (throughput, retransmissões, RTT/jitter).
- `session` (L5): sessões/estados (quando disponível).
- `presentation` (L6): TLS/encoding (handshake/erros; quando disponível).
- `application` (L7): HTTP/DNS/app (latência, erros, disponibilidade).
- `control`: plano de controle SDN (controlador/OpenFlow).
- `dataplane`: plano de dados SDN (flows/tabelas/counters).

Arquivos brutos são gravados em `raw/metrics_{layer}.jsonl`. Artefatos de experimentos/configs ficam em `temp/`.

## Uso da UI
- Dashboard: visão geral inicial.
- Topologia: mapa lógico (hosts, switches, controlador) e lista de links.
- Monitor: KPIs ao vivo, tabela de eventos, filtros por camada e por nó, horários em Brasília, seção de saúde do stream.
- Lab: biblioteca de blocos por camada (Ping, TCP, UDP, HTTP, DNS, Controle, Flows, Link, Interface física); adicione ao workflow e veja métricas ao vivo filtradas pelo bloco; alimentado por SSE.
- Experimentos: biblioteca de templates (30+), execução em 1 clique ("Usar + executar") e modo manual para cenários específicos; resultados na tela e export JSON.
- Configurações: gerencia múltiplos ambientes (configs salvas) e define a config ativa usada pela coleta.
- Histórico: execuções passadas e artefatos persistidos.

## Coleta, stream e backfill
- `REAL_COLLECTION=1` ativa coleta real no loop automático; caso contrário, usa sintética.
- `AUTO_COLLECT_INTERVAL` (segundos) controla a frequência da auto-coleta.
- O backend restaura métricas recentes dos arquivos `raw/metrics_{layer}.jsonl` ao iniciar para que a UI não fique zerada.
- SSE (`/stream/events`) envia topologia, runs e ~200 métricas recentes.
- Se quiser forçar coleta manual: `curl -X POST "http://localhost:8000/metrics/collect?mode=real" -H "X-API-Key: $API_KEY"`.

## Licenca
MIT License. Veja `LICENSE`.
