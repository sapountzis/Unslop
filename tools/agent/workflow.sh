#!/usr/bin/env bash
set -euo pipefail

if ! bun run ./tools/agent/workflow_check.ts; then
  echo "[WORKFLOW] FAIL: workflow checks failed." >&2
  echo "[WORKFLOW] Remediation: apply the specific action from the first [WORKFLOW] ERROR line (marker, branch/worktree state, or plan linkage)." >&2
  echo "[WORKFLOW] Hint: if initialization state is missing, re-run 'make init-feature FEATURE=<task-slug>' from the primary checkout." >&2
  echo "[WORKFLOW] Protocol: re-run 'make workflow' until it passes." >&2
  exit 1
fi

echo "[WORKFLOW] PASS: workflow checks are compliant."
