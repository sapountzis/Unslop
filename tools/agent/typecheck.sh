#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TYPECHECK_ENGINE="${TYPECHECK_ENGINE:-auto}" # auto|tsgo|tsc

resolve_engine() {
  if [ "$TYPECHECK_ENGINE" = "auto" ]; then
    echo "tsgo"
    return 0
  fi
  echo "$TYPECHECK_ENGINE"
}

is_tsgo_compatibility_failure() {
  local log_path="$1"
  grep -Eqi "(panic:|internal compiler error|not yet implemented|unknown compiler option|failed to parse tsconfig|module resolution mode .* not supported)" "$log_path"
}

run_backend_tsc() {
  (cd "$ROOT_DIR/backend" && bunx tsc --noEmit -p tsconfig.json)
}

run_extension_tsc() {
  (cd "$ROOT_DIR/extension" && bunx tsc --noEmit -p tsconfig.json)
}

run_with_engine() {
  local label="$1"
  local tsconfig_path="$2"
  local tsc_runner="$3"
  local engine="$4"

  if [ "$engine" = "tsc" ]; then
    "$tsc_runner"
    return 0
  fi

  if ! (cd "$ROOT_DIR" && bunx tsgo --version >/dev/null 2>&1); then
    echo "[TYPE] WARN: tsgo is unavailable; falling back to tsc for ${label}." >&2
    "$tsc_runner"
    return 0
  fi

  local tsgo_log
  tsgo_log="$(mktemp "${ROOT_DIR}/.tmp-tsgo.${label}.XXXXXX.log")"

  if (cd "$ROOT_DIR" && bunx tsgo --noEmit -p "$tsconfig_path") >"$tsgo_log" 2>&1; then
    rm -f "$tsgo_log"
    return 0
  fi

  if is_tsgo_compatibility_failure "$tsgo_log"; then
    echo "[TYPE] WARN: tsgo compatibility gap detected for ${label}; falling back to tsc." >&2
    tail -n 60 "$tsgo_log" >&2 || true
    rm -f "$tsgo_log"
    "$tsc_runner"
    return 0
  fi

  echo "[TYPE] FAIL: ${label} type-check failed under tsgo." >&2
  tail -n 200 "$tsgo_log" >&2 || true
  rm -f "$tsgo_log"
  return 1
}

ENGINE="$(resolve_engine)"
if [ "$ENGINE" != "tsgo" ] && [ "$ENGINE" != "tsc" ]; then
  echo "[TYPE] FAIL: TYPECHECK_ENGINE must be one of: auto, tsgo, tsc." >&2
  exit 64
fi

failures=0
failed_components=()
TMP_DIR="$(mktemp -d "${ROOT_DIR}/.tmp-type.XXXXXX")"
trap 'rm -rf "$TMP_DIR"' EXIT

BACKEND_LOG="$TMP_DIR/backend.log"
if ! run_with_engine "backend" "backend/tsconfig.json" run_backend_tsc "$ENGINE" >"$BACKEND_LOG" 2>&1; then
  failures=$((failures + 1))
  failed_components+=("backend")
  echo "[TYPE] FAIL: backend type-check failed." >&2
  echo "[TYPE] --- backend type log tail ---" >&2
  tail -n 120 "$BACKEND_LOG" >&2 || true
  echo "[TYPE] --- end backend type log ---" >&2
  echo "[TYPE] Remediation: fix backend TypeScript errors shown above." >&2
fi

EXTENSION_LOG="$TMP_DIR/extension.log"
if ! run_with_engine "extension" "extension/tsconfig.json" run_extension_tsc "$ENGINE" >"$EXTENSION_LOG" 2>&1; then
  failures=$((failures + 1))
  failed_components+=("extension")
  echo "[TYPE] FAIL: extension type-check failed." >&2
  echo "[TYPE] --- extension type log tail ---" >&2
  tail -n 120 "$EXTENSION_LOG" >&2 || true
  echo "[TYPE] --- end extension type log ---" >&2
  echo "[TYPE] Remediation: fix extension TypeScript errors shown above." >&2
fi

FRONTEND_LOG="$TMP_DIR/frontend.log"
if ! (cd frontend && bun run build) >"$FRONTEND_LOG" 2>&1; then
  failures=$((failures + 1))
  failed_components+=("frontend")
  echo "[TYPE] FAIL: frontend build/type validation failed." >&2
  echo "[TYPE] --- frontend type log tail ---" >&2
  tail -n 120 "$FRONTEND_LOG" >&2 || true
  echo "[TYPE] --- end frontend type log ---" >&2
  echo "[TYPE] Remediation: fix frontend build/type issues shown above." >&2
fi

if [ "$failures" -gt 0 ]; then
  echo "[TYPE] Failed components: ${failed_components[*]}" >&2
  echo "[TYPE] FAIL: ${failures} type/build gate(s) failed." >&2
  echo "[TYPE] Protocol: re-run 'make type' until it passes." >&2
  exit 1
fi

echo "[TYPE] PASS: type/build checks are compliant (engine: ${ENGINE})."
