#!/usr/bin/env bash
set -euo pipefail

if ! bun run ./tools/agent/workflow_check.ts; then
  echo "[WORKFLOW] FAIL: workflow checks failed." >&2
  echo "[WORKFLOW] Remediation: follow the exact diagnostics shown above." >&2
  echo "[WORKFLOW] Protocol: re-run 'make workflow' until it passes." >&2
  exit 1
fi

echo "[WORKFLOW] PASS: workflow checks are compliant."
