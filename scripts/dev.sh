#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

BACKEND_HOST="${BACKEND_HOST:-0.0.0.0}"
BACKEND_PORT="${BACKEND_PORT:-8000}"
FRONTEND_HOST="${FRONTEND_HOST:-0.0.0.0}"
FRONTEND_PORT="${FRONTEND_PORT:-3000}"

PLATFORM_CONFIG_PATH="${PLATFORM_CONFIG_PATH:-platform/experiments/platform_config.json}"
REAL_COLLECTION="${REAL_COLLECTION:-1}"
AUTO_COLLECT_INTERVAL="${AUTO_COLLECT_INTERVAL:-5}"

mkdir -p temp

if [[ ! -d .venv ]]; then
  python -m venv .venv
fi

source .venv/bin/activate
pip -q install -r requirements.txt

(
  pkill -f "uvicorn platform.backend.api.app:app" 2>/dev/null || true
  nohup env \
    PLATFORM_CONFIG_PATH="$PLATFORM_CONFIG_PATH" \
    REAL_COLLECTION="$REAL_COLLECTION" \
    AUTO_COLLECT_INTERVAL="$AUTO_COLLECT_INTERVAL" \
    PYTHONPATH="$ROOT_DIR" \
    .venv/bin/uvicorn platform.backend.api.app:app \
      --host "$BACKEND_HOST" \
      --port "$BACKEND_PORT" \
      > temp/backend.log 2>&1 &
  echo $! > temp/backend.pid
)

(
  cd platform/frontend-next
  npm install --silent
  pkill -f "next start" 2>/dev/null || true
  pkill -f "next dev" 2>/dev/null || true
  nohup env \
    NEXT_PUBLIC_API_URL="http://localhost:${BACKEND_PORT}" \
    BACKEND_URL="http://127.0.0.1:${BACKEND_PORT}" \
    npm run dev -- --port "$FRONTEND_PORT" \
      > ../../temp/frontend.log 2>&1 &
  echo $! > ../../temp/frontend.pid
)

for _ in {1..150}; do
  if curl -fsS --max-time 1 "http://127.0.0.1:${BACKEND_PORT}/health" >/dev/null 2>&1; then
    break
  fi
  sleep 0.2
done

if ! curl -fsS --max-time 2 "http://127.0.0.1:${BACKEND_PORT}/health" >/dev/null 2>&1; then
  echo "Backend failed to become ready (see temp/backend.log)" >&2
  tail -n 80 temp/backend.log >&2 || true
  exit 1
fi

for _ in {1..150}; do
  if curl -fsS --max-time 1 "http://127.0.0.1:${FRONTEND_PORT}/" >/dev/null 2>&1; then
    break
  fi
  sleep 0.2
done

echo "Backend:  http://localhost:${BACKEND_PORT} (PID $(cat temp/backend.pid))"
echo "Frontend: http://localhost:${FRONTEND_PORT} (PID $(cat temp/frontend.pid))"
