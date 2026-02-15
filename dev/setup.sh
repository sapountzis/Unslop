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

if [ ! -f "package.json" ]; then
  log "bootstrap root package.json (shared tooling)"
  cat > package.json <<'JSON'
{
  "name": "unslop-root",
  "private": true,
  "scripts": {
    "agent:format": "bash ./tools/agent/format_fix.sh",
    "agent:format:check": "bash ./tools/agent/format_check.sh",
    "agent:lint": "bash ./tools/agent/lint.sh",
    "agent:type": "bash ./tools/agent/typecheck.sh",
    "agent:test": "bash ./tools/agent/test.sh",
    "agent:doclint": "bash ./tools/agent/doclint.sh",
    "agent:archlint": "bash ./tools/agent/archlint.sh"
  },
  "devDependencies": {
    "@biomejs/biome": "^2.3.15",
    "@playwright/test": "^1.58.2",
    "@typescript/native-preview": "latest",
    "@types/bun": "^1.3.8"
  }
}
JSON
fi

log "install root dependencies"
bun install

log "verify tsgo availability"
if ! bunx tsgo --version >/dev/null 2>&1; then
  echo "[SETUP] ERROR: tsgo is required but unavailable after root dependency install." >&2
  echo "[SETUP] Remediation: ensure '@typescript/native-preview' is present in root devDependencies and rerun setup." >&2
  echo "[SETUP] Protocol: re-run 'make setup' until it passes." >&2
  exit 1
fi

log "install Playwright Chromium browser"
bunx playwright install chromium

for dir in backend extension frontend; do
  if [ -f "$dir/package.json" ]; then
    log "install dependencies: $dir"
    (cd "$dir" && bun install)
  fi
done

log "setup complete"
