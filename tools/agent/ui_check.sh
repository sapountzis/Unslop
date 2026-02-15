#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TMP_DIR="$(mktemp -d "${ROOT_DIR}/.tmp-check-ui.XXXXXX")"
SERVER_PID=""
SERVER_STARTED=0
UI_PORT=""

pick_ui_port() {
  local candidate=""
  local tries=0

  if [ -n "${UI_CHECK_PORT:-}" ]; then
    echo "$UI_CHECK_PORT"
    return 0
  fi

  while [ "$tries" -lt 30 ]; do
    candidate=$((4300 + (RANDOM % 500)))
    if ! curl -fsS "http://127.0.0.1:${candidate}" >/dev/null 2>&1; then
      echo "$candidate"
      return 0
    fi
    tries=$((tries + 1))
  done

  echo "4321"
}

wait_for_frontend() {
  local url="http://127.0.0.1:${UI_PORT}"
  local tries=0
  while [ "$tries" -lt 60 ]; do
    if curl -fsS "$url" >/dev/null 2>&1; then
      return 0
    fi

    if [ "$SERVER_STARTED" -eq 1 ] && ! kill -0 "$SERVER_PID" 2>/dev/null; then
      return 1
    fi

    tries=$((tries + 1))
    sleep 1
  done

  return 1
}

cleanup() {
  if [ "$SERVER_STARTED" -eq 1 ] && [ -n "$SERVER_PID" ]; then
    kill "$SERVER_PID" >/dev/null 2>&1 || true
    wait "$SERVER_PID" >/dev/null 2>&1 || true
  fi
  rm -rf "$TMP_DIR" "$ROOT_DIR/test-results" "$ROOT_DIR/playwright-report"
}
trap cleanup EXIT

if [ ! -f "${ROOT_DIR}/package.json" ]; then
  echo "[CHECK:UI] FAIL: no root package.json found; UI checks cannot run." >&2
  echo "[CHECK:UI] Remediation: run 'make setup' to bootstrap root tooling." >&2
  echo "[CHECK:UI] Protocol: re-run 'make setup', then re-run 'make ui' until it passes." >&2
  exit 1
fi

# Start a local frontend server when one is not already running.
UI_PORT="$(pick_ui_port)"
(
  cd "$ROOT_DIR/frontend"
  bun run dev --host 127.0.0.1 --port "${UI_PORT}"
) >"$TMP_DIR/frontend-dev.log" 2>&1 &
SERVER_PID=$!
SERVER_STARTED=1

if ! wait_for_frontend; then
  echo "[CHECK:UI] FAIL: frontend server did not become ready on http://127.0.0.1:${UI_PORT}." >&2
  if [ -f "$TMP_DIR/frontend-dev.log" ]; then
    echo "[CHECK:UI] Frontend startup log tail:" >&2
    tail -n 40 "$TMP_DIR/frontend-dev.log" >&2 || true
  fi
  echo "[CHECK:UI] Remediation: fix frontend startup errors shown above." >&2
  echo "[CHECK:UI] Protocol: re-run 'make ui' until it passes." >&2
  exit 1
fi

if ! (
  cd "$ROOT_DIR" &&
    UI_CHECK_BASE_URL="http://127.0.0.1:${UI_PORT}" PLAYWRIGHT_HTML_REPORT="$TMP_DIR/playwright-report" bunx playwright test --output "$TMP_DIR/test-results"
); then
  echo "[CHECK:UI] FAIL: Playwright UI checks failed." >&2
  echo "[CHECK:UI] Remediation: address failing UI assertions in the output above." >&2
  echo "[CHECK:UI] Protocol: re-run 'make ui' until it passes." >&2
  exit 1
fi

echo "[CHECK:UI] PASS: Playwright UI checks are compliant."
