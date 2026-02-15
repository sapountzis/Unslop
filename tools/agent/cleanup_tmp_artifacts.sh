#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

remove_matches() {
  local pattern="$1"
  local path=""
  shopt -s nullglob
  for path in $pattern; do
    rm -rf "$path"
  done
  shopt -u nullglob
}

remove_matches "$ROOT_DIR/.tmp-check.*"
remove_matches "$ROOT_DIR/.tmp-check-ui.*"
remove_matches "$ROOT_DIR/.tmp-setup.*"
rm -rf "$ROOT_DIR/test-results" "$ROOT_DIR/playwright-report"
