#!/usr/bin/env bash
set -euo pipefail

COMPOSE_FILE=${1:-docker-compose.yml}

if [ ! -f "$COMPOSE_FILE" ]; then
  echo "compose file '$COMPOSE_FILE' not found" >&2
  exit 1
fi

docker compose -f "$COMPOSE_FILE" down -v
