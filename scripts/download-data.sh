#!/usr/bin/env bash
#
# Reproducible pull of the "Game of Thrones Script - All Seasons" Kaggle
# dataset into ./data (git-ignored). Requires uv and a Kaggle API token via
# one of: ~/.kaggle/access_token, KAGGLE_API_TOKEN, ~/.kaggle/kaggle.json,
# or KAGGLE_USERNAME + KAGGLE_KEY.
#
# Dataset: https://www.kaggle.com/datasets/albenft/game-of-thrones-script-all-seasons
#
set -euo pipefail

DATASET="albenft/game-of-thrones-script-all-seasons"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DATA_DIR="$REPO_ROOT/data"

mkdir -p "$DATA_DIR"

if [[ ! -f "$HOME/.kaggle/access_token" \
      && ! -f "$HOME/.kaggle/kaggle.json" \
      && -z "${KAGGLE_API_TOKEN:-}" \
      && ( -z "${KAGGLE_USERNAME:-}" || -z "${KAGGLE_KEY:-}" ) ]]; then
  cat >&2 <<'EOF'
ERROR: No Kaggle credentials found.

Get a token at https://www.kaggle.com/settings/account -> "Create New Token".
Then save it (newer token format):
  mkdir -p ~/.kaggle && echo <YOUR_TOKEN> > ~/.kaggle/access_token && chmod 600 ~/.kaggle/access_token
or export it inline:
  KAGGLE_API_TOKEN=<YOUR_TOKEN> ./scripts/download-data.sh
EOF
  exit 1
fi

if ! command -v uv >/dev/null 2>&1; then
  echo "ERROR: uv is not installed. Install it from https://docs.astral.sh/uv/" >&2
  exit 1
fi

echo "Downloading $DATASET ..."
uvx --from kaggle kaggle datasets download -d "$DATASET" -p "$DATA_DIR" --unzip

echo "Done. Files in $DATA_DIR:"
ls -lh "$DATA_DIR"
