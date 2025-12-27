# profissa-sdn-framework

Plataforma modular e programavel para orquestrar e monitorar experimentos em Redes SDN. Inclui API RESTful (FastAPI), UI web (Vite + React) e componentes para coleta estruturada de metricas, com foco em reprodutibilidade e extensibilidade.

## Stack
- Backend: Python 3.11+, FastAPI (REST/WebSocket), promotor de modularidade para controladores SDN (ONOS, OpenDaylight, Ryu, Floodlight) escolhidos pelo usuario.
- Frontend: Vite + React (TS) consumindo REST/WebSocket.
- Ambiente de rede: Mininet e/ou containers Docker, orquestrados preferencialmente com Docker Compose (Kubernetes opcional futuro).
- Observabilidade: Prometheus client integrado para exposicao/push; coleta em arquivos CSV/JSON.
- Qualidade: pytest (+pytest-asyncio) com cobertura minima 70%, ruff, black, isort. CI via GitHub Actions.

## Estrutura de pastas
- `platform/backend/` – backend FastAPI (a desenvolver) e assets de API.
- `platform/frontend/` – frontend Vite + React (scaffold inicial em `package.json`).
- `platform/infra/` – scripts/manifests de infraestrutura (Docker Compose, etc.).
- `platform/docs/` – documentacao tecnica e diagramas.
- `platform/experiments/` – exemplos e templates de experimentos.
- `gr-netmon/` – blocos GNU Radio/netmon usados para cenarios SDR/SDN.
- `raw/` – dados brutos exportados (CSV/JSON de monitoramento).
- `tests/` – suite de testes pytest.
- `monitor.py` / `monitor copy.py` – utilitarios de monitoramento e probes (ping/TCP/UDP, opcional throughput/captura).
- `requirements.txt` / `requirements-dev.txt` – dependencias runtime e de desenvolvimento.
- `VERSION` – versionamento semantico (atual 0.1.0).
- `LICENSE` – licenca MIT.

## Requisitos
- Python 3.11+ (recomendado).
- Node.js 20+ (para frontend).
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

## API RESTful (backend)
- Config central: `platform/experiments/platform_config.json` (ou altere via `PLATFORM_CONFIG_PATH`). Contém ambiente, controladores, nós/links, perfis de tráfego, plano de métricas, fluxos e flags por camada (`metric_layers`).
- Rodar o servidor:
```bash
PYTHONPATH=$(pwd) .venv/bin/uvicorn platform.backend.api.app:app --host 0.0.0.0 --port 8000
# opcional: export API_KEY=suachave para exigir header X-API-Key
```
- Endpoints principais (sem prefixo `/api`):
	- `GET /health`
	- Topologias: `POST/GET/PUT/DELETE /topologies`, `GET /topologies/{id}`
	- Experimentos: `POST/GET/PUT/DELETE /experiments`, `GET /experiments/{id}`, `POST /experiments/{id}/run`, `GET /experiments/{id}/runs`, `GET /runs/{run_id}`
	- Métricas (novas rotas):
		- `GET /metrics/definitions`
		- `POST /metrics/samples` (ingestão JSONL-like; aceita 1 ou N amostras)
		- `POST /metrics/query` (filtros por `metric_names`, `nodes`, `layers`, `start_time`, `end_time`, `limit`)
		- `GET /metrics/latest` (snapshot mais recente por métrica/nó/camada)
		- `GET /metrics/export?layer=network` (exporta texto JSONL do arquivo bruto por camada)
		- `POST /metrics/collect` (coletor mínimo sintético; requer API key se configurada)
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
- Implementar API FastAPI em `platform/backend/` expondo CRUD de topologias/experimentos e orquestracao.
- Subir shell inicial do frontend em `platform/frontend/` consumindo a API.
- Adicionar manifests em `platform/infra/` para ambientes Docker/Mininet.

## Camadas de métricas (referência rápida)
- `physical`: contadores de interface (erros, descartes, potencia/temperatura quando disponível).
- `link`: utilização de enlace, perda, jitter e ocupação de filas.
- `network`: latência ICMP, perda, ARP/ND, reachability.
- `transport`: throughput ativo, retransmissões TCP, jitter/perda UDP.
- `application`: tempo de resposta HTTP/DNS/TLS, disponibilidade de serviço.
- `control`: saúde do controlador, latência do plano de controle, sessões OpenFlow.
- `dataplane`: contadores de flow/table OpenFlow e estatísticas de porta.

Arquivos brutos são gravados em `raw/metrics_{layer}.jsonl`. Ative/desative coleta por camada via `metric_layers` no `platform_config.json` (ex.: `"link": false` para desligar L2).

## Licenca
MIT License. Veja `LICENSE`.
