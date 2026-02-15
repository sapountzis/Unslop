#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

if [ "$#" -eq 0 ]; then
  echo "Usage: ./tools/agent/run_with_cleanup.sh <command> [args...]" >&2
  exit 64
fi

if [ -f "$ROOT_DIR/tools/agent/cleanup_tmp_artifacts.sh" ]; then
  bash "$ROOT_DIR/tools/agent/cleanup_tmp_artifacts.sh"
fi

set +e
(cd "$ROOT_DIR" && "$@")
status=$?
set -e

if [ -f "$ROOT_DIR/tools/agent/cleanup_tmp_artifacts.sh" ]; then
  bash "$ROOT_DIR/tools/agent/cleanup_tmp_artifacts.sh"
else
  echo "[CLEANUP] INFO: skipped post-command temp cleanup because worktree is no longer available." >&2
fi
exit "$status"
