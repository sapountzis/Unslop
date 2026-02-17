#!/usr/bin/env bash
set -euo pipefail

CMD="${1:-status}"
COMPOSE_FILE="dev/observability-compose.yml"

case "$CMD" in
  up)
    docker compose -f "$COMPOSE_FILE" up -d
    ;;
  down)
    docker compose -f "$COMPOSE_FILE" down
    ;;
  status)
    docker compose -f "$COMPOSE_FILE" ps
    ;;
  logs)
    docker compose -f "$COMPOSE_FILE" logs --tail=100
    ;;
  *)
    echo "Usage: dev/obs.sh [up|down|status|logs]" >&2
    exit 64
    ;;
esac
