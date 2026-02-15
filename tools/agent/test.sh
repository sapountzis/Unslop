#!/usr/bin/env bash
set -euo pipefail

if ! (cd backend && bun run test); then
  echo "[TEST] FAIL: backend tests failed." >&2
  echo "[TEST] Remediation: fix failing backend tests shown above." >&2
  echo "[TEST] Protocol: re-run 'make test' until it passes." >&2
  exit 1
fi

if ! (cd extension && bun test src/); then
  echo "[TEST] FAIL: extension tests failed." >&2
  echo "[TEST] Remediation: fix failing extension tests shown above." >&2
  echo "[TEST] Protocol: re-run 'make test' until it passes." >&2
  exit 1
fi

echo "[TEST] PASS: test suites are compliant."
