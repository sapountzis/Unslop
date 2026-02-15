#!/usr/bin/env bash
set -euo pipefail

if ! bun run ./tools/agent/taskflow_check.ts; then
  echo "[TASKFLOW] FAIL: taskflow lifecycle checks failed." >&2
  echo "[TASKFLOW] Remediation: apply the action from the first [TASKFLOW] ERROR line (plan count/path, missing sections, placeholders, or loop evidence)." >&2
  echo "[TASKFLOW] Hint: code changes must map to exactly one touched plan file with explicit edit -> make check -> review entries." >&2
  echo "[TASKFLOW] Protocol: re-run 'make taskflow' until it passes." >&2
  exit 1
fi

echo "[TASKFLOW] PASS: taskflow lifecycle checks are compliant."
