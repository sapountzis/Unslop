#!/usr/bin/env bash
set -euo pipefail

if ! (cd backend && bun run type-check); then
  echo "[TYPE] FAIL: backend type-check failed." >&2
  echo "[TYPE] Remediation: fix backend TypeScript errors shown above." >&2
  echo "[TYPE] Protocol: re-run 'make type' until it passes." >&2
  exit 1
fi

if ! (cd extension && bunx tsc --noEmit -p tsconfig.json); then
  echo "[TYPE] FAIL: extension type-check failed." >&2
  echo "[TYPE] Remediation: fix extension TypeScript errors shown above." >&2
  echo "[TYPE] Protocol: re-run 'make type' until it passes." >&2
  exit 1
fi

if ! (cd frontend && bun run build); then
  echo "[TYPE] FAIL: frontend build/type validation failed." >&2
  echo "[TYPE] Remediation: fix frontend build/type issues shown above." >&2
  echo "[TYPE] Protocol: re-run 'make type' until it passes." >&2
  exit 1
fi

echo "[TYPE] PASS: type/build checks are compliant."
