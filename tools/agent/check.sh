#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CMD="${1:-all}"
TMP_DIR="$(mktemp -d "${ROOT_DIR}/.tmp-check.XXXXXX")"
trap 'rm -rf "$TMP_DIR"' EXIT
export TMPDIR="$TMP_DIR"

run_gate() {
  local gate="$1"
  local retry_cmd="$2"
  local log_file="$TMP_DIR/${gate}.log"
  shift 2
  echo "[CHECK] running: $gate"
  if ! (cd "$ROOT_DIR" && "$@") >"$log_file" 2>&1; then
    echo "[CHECK] FAIL: gate '$gate' failed. See diagnostics above." >&2
    echo "[CHECK] --- gate log ($gate) ---" >&2
    tail -n 200 "$log_file" >&2 || true
    echo "[CHECK] --- end gate log ($gate) ---" >&2
    echo "[CHECK] Protocol: address the '$gate' failure, then re-run '$retry_cmd' until it passes." >&2
    exit 1
  fi
}

case "$CMD" in
  fmt) run_gate "fmt" "make fmt" bash ./tools/agent/format_fix.sh ;;
  fmtcheck) run_gate "fmtcheck" "make fmtcheck" bash ./tools/agent/format_check.sh ;;
  lint) run_gate "lint" "make lint" bash ./tools/agent/lint.sh ;;
  type) run_gate "type" "make type" bash ./tools/agent/typecheck.sh ;;
  test) run_gate "test" "make test" bash ./tools/agent/test.sh ;;
  doclint) run_gate "doclint" "make doclint" bash ./tools/agent/doclint.sh ;;
  archlint) run_gate "archlint" "make archlint" bash ./tools/agent/archlint.sh ;;
  taskflow) run_gate "taskflow" "make taskflow" bash ./tools/agent/taskflow.sh ;;
  ui) run_gate "ui" "make ui" bash ./tools/agent/ui_check.sh ;;
  all)
    run_gate "fmtcheck" "make check" bash ./tools/agent/format_check.sh
    run_gate "lint" "make check" bash ./tools/agent/lint.sh
    run_gate "type" "make check" bash ./tools/agent/typecheck.sh
    run_gate "test" "make check" bash ./tools/agent/test.sh
    run_gate "ui" "make check" bash ./tools/agent/ui_check.sh
    run_gate "doclint" "make check" bash ./tools/agent/doclint.sh
    run_gate "archlint" "make check" bash ./tools/agent/archlint.sh
    run_gate "taskflow" "make check" bash ./tools/agent/taskflow.sh
    echo "[CHECK] PASS: all gates succeeded."
    ;;
  *)
    echo "Unknown check target: $CMD" >&2
    echo "Usage: ./tools/agent/check.sh [fmt|fmtcheck|lint|type|test|ui|doclint|archlint|taskflow|all]" >&2
    exit 64
    ;;
esac
