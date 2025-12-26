# Contribuição

Obrigado por contribuir com o projeto!

## Ambiente
- Python 3.11+ e Node.js 20+.
- Crie e ative um ambiente virtual: `python -m venv .venv && source .venv/bin/activate`.
- Instale dependências: `pip install -r requirements-dev.txt`.
- (Frontend) instale deps com `npm install` em `platform/frontend` quando iniciar a UI.

## Checks locais
- Testes: `pytest`.
- Lint: `ruff check . --exit-zero` (non-blocking inicial).
- Formatação: `black .` (opcional).
- Build frontend: `npm run build` (quando a UI existir).

## Fluxo de trabalho
- Branches: `feature/<nome>` ou `fix/<nome>`.
- Abra PR com testes passando e descreva mudanças e impacto.
- Prefira commits pequenos e claros.
