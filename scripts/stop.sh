#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

stop_pidfile() {
  local pidfile="$1"
  if [[ -f "$pidfile" ]]; then
    local pid
    pid="$(cat "$pidfile" || true)"
    if [[ -n "${pid:-}" ]] && kill -0 "$pid" 2>/dev/null; then
      kill "$pid" || true
    fi
    rm -f "$pidfile"
  fi
}

stop_pidfile temp/frontend.pid
stop_pidfile temp/backend.pid

# Fallback (in case pid files got stale)
pkill -f "uvicorn platform.backend.api.app:app" 2>/dev/null || true
pkill -f "vite --host" 2>/dev/null || true

echo "Stopped backend/frontend (if running)."
