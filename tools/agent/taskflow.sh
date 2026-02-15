#!/usr/bin/env bash
set -euo pipefail

if ! bun run ./tools/agent/taskflow_check.ts; then
  echo "[TASKFLOW] FAIL: taskflow lifecycle checks failed." >&2
  echo "[TASKFLOW] Remediation: follow the exact diagnostics shown above." >&2
  echo "[TASKFLOW] Protocol: re-run 'make taskflow' until it passes." >&2
  exit 1
fi

echo "[TASKFLOW] PASS: taskflow lifecycle checks are compliant."
