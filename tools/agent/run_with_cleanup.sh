#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

if [ "$#" -eq 0 ]; then
  echo "Usage: ./tools/agent/run_with_cleanup.sh <command> [args...]" >&2
  exit 64
fi

bash "$ROOT_DIR/tools/agent/cleanup_tmp_artifacts.sh"

set +e
(cd "$ROOT_DIR" && "$@")
status=$?
set -e

bash "$ROOT_DIR/tools/agent/cleanup_tmp_artifacts.sh"
exit "$status"
