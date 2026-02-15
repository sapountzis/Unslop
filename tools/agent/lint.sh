#!/usr/bin/env bash
set -euo pipefail

BIOME_BIN="./node_modules/.bin/biome"

if [ ! -x "$BIOME_BIN" ]; then
  echo "[LINT] FAIL: Biome is not installed at '$BIOME_BIN'." >&2
  echo "[LINT] Remediation: run 'make setup' to install local tooling dependencies." >&2
  echo "[LINT] Protocol: run 'make setup', then re-run 'make lint' until it passes." >&2
  exit 1
fi

if ! "$BIOME_BIN" lint --reporter=summary .; then
  echo "[LINT] FAIL: Biome lint checks failed." >&2
  echo "[LINT] Remediation: address the Biome diagnostics shown above." >&2
  echo "[LINT] Protocol: re-run 'make lint' until it passes." >&2
  exit 1
fi

echo "[LINT] PASS: lint checks are compliant."
