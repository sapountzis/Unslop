#!/usr/bin/env bash
set -euo pipefail

log() { printf '[SETUP] %s\n' "$1"; }

TMP_DIR="$(mktemp -d "$(pwd)/.tmp-setup.XXXXXX")"
trap 'rm -rf "$TMP_DIR"' EXIT
export TMPDIR="$TMP_DIR"
export BUN_INSTALL_CACHE_DIR="$TMP_DIR/cache"
mkdir -p "$BUN_INSTALL_CACHE_DIR"

if ! command -v bun >/dev/null 2>&1; then
  echo "[SETUP] ERROR: Bun is required but not installed." >&2
  echo "[SETUP] Remediation: install Bun (https://bun.sh), then retry setup." >&2
  echo "[SETUP] Protocol: re-run 'make setup' until it passes." >&2
  exit 1
fi

for dir in backend extension frontend; do
  if [ -f "$dir/package.json" ]; then
    log "install dependencies: $dir"
    (cd "$dir" && bun install)
  fi
done

if [ -f "frontend/package.json" ]; then
  log "install Playwright Chromium browser: frontend"
  (cd frontend && bunx playwright install chromium)
fi

log "setup complete"
