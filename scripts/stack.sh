#!/usr/bin/env bash
#
# Manage the local data stack (Redis 8 + Postgres 17 + RedisInsight).
#
#   ./scripts/stack.sh up               # start everything in the background
#   ./scripts/stack.sh down             # stop containers (data volumes kept)
#   ./scripts/stack.sh ps               # show status
#   ./scripts/stack.sh logs [service]   # tail logs (default: all)
#   ./scripts/stack.sh redis-cli        # open redis-cli in the container
#   ./scripts/stack.sh psql             # open psql in the container
#   ./scripts/stack.sh nuke             # stop AND delete all data volumes (destructive)
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

case "${1:-up}" in
  up)        docker compose up -d && docker compose ps ;;
  down)      docker compose down ;;
  ps)        docker compose ps ;;
  logs)      docker compose logs -f "${2:-}" ;;
  redis-cli) docker compose exec redis redis-cli ;;
  psql)      docker compose exec postgres psql -U got -d got ;;
  nuke)      docker compose down -v ;;
  *)         echo "usage: $0 {up|down|ps|logs|redis-cli|psql|nuke}" >&2; exit 1 ;;
esac
