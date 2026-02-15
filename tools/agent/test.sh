#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TMP_DIR="$(mktemp -d "${ROOT_DIR}/.tmp-test.XXXXXX")"
trap 'rm -rf "$TMP_DIR"' EXIT

failures=0
failed_suites=()

BACKEND_LOG="$TMP_DIR/backend.log"
if ! (cd "$ROOT_DIR/backend" && bun run test) >"$BACKEND_LOG" 2>&1; then
  failures=$((failures + 1))
  failed_suites+=("backend")
  echo "[TEST] FAIL: backend tests failed." >&2
  echo "[TEST] --- backend test log tail ---" >&2
  tail -n 120 "$BACKEND_LOG" >&2 || true
  echo "[TEST] --- end backend test log ---" >&2
  echo "[TEST] Remediation: fix failing backend tests shown above." >&2
fi

EXTENSION_LOG="$TMP_DIR/extension.log"
if ! (cd "$ROOT_DIR/extension" && bun test src/) >"$EXTENSION_LOG" 2>&1; then
  failures=$((failures + 1))
  failed_suites+=("extension")
  echo "[TEST] FAIL: extension tests failed." >&2
  echo "[TEST] --- extension test log tail ---" >&2
  tail -n 120 "$EXTENSION_LOG" >&2 || true
  echo "[TEST] --- end extension test log ---" >&2
  echo "[TEST] Remediation: fix failing extension tests shown above." >&2
fi

if [ "$failures" -gt 0 ]; then
  echo "[TEST] Failed suites: ${failed_suites[*]}" >&2
  echo "[TEST] FAIL: ${failures} test suite(s) failed." >&2
  echo "[TEST] Protocol: re-run 'make test' until it passes." >&2
  exit 1
fi

echo "[TEST] PASS: test suites are compliant."
