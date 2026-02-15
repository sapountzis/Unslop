#!/usr/bin/env bash
set -euo pipefail

if ! bun run ./tools/agent/doc_lint.ts; then
  echo "[DOCLINT] FAIL: documentation lint checks failed." >&2
  echo "[DOCLINT] Remediation: address the diagnostics shown above." >&2
  echo "[DOCLINT] Protocol: re-run 'make doclint' until it passes." >&2
  exit 1
fi

echo "[DOCLINT] PASS: documentation lint checks are compliant."
