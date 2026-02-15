#!/usr/bin/env bash
set -euo pipefail

if ! bun run ./tools/agent/arch_lint.ts; then
  echo "[ARCHLINT] FAIL: architecture lint checks failed." >&2
  echo "[ARCHLINT] Remediation: fix the reported dependency-direction violations and move imports/modules to satisfy ARCHITECTURE.md layering rules." >&2
  echo "[ARCHLINT] Protocol: re-run 'make archlint' until it passes." >&2
  exit 1
fi

echo "[ARCHLINT] PASS: architecture lint checks are compliant."
