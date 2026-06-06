#!/usr/bin/env bash
#
# Launch the marimo GoT script explorer (deps are inline in the notebook).
#   ./scripts/explore.sh        # interactive editor
#   ./scripts/explore.sh run    # read-only app
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
NOTEBOOK="$REPO_ROOT/analysis/got_explorer.py"

if [[ ! -f "$REPO_ROOT/data/Game_of_Thrones_Script.csv" ]]; then
  echo "Dataset not found. Pulling it first..."
  "$SCRIPT_DIR/download-data.sh"
fi

MODE="${1:-edit}"
exec uvx marimo "$MODE" --sandbox "$NOTEBOOK"
