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

## CI/CD
Pipeline GitHub Actions em `.github/workflows/ci.yml`: instala deps, roda ruff check e pytest com cobertura minima de 70%.

## Roadmap curto
- Implementar API FastAPI em `platform/backend/` expondo CRUD de topologias/experimentos e orquestracao.
- Subir shell inicial do frontend em `platform/frontend/` consumindo a API.
- Adicionar manifests em `platform/infra/` para ambientes Docker/Mininet.

## Licenca
MIT License. Veja `LICENSE`.
