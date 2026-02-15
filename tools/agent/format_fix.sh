#!/usr/bin/env bash
set -euo pipefail

BIOME_BIN="./node_modules/.bin/biome"

if [ ! -x "$BIOME_BIN" ]; then
  echo "[FORMAT] FAIL: Biome is not installed at '$BIOME_BIN'." >&2
  echo "[FORMAT] Remediation: run 'make setup' to install local tooling dependencies." >&2
  echo "[FORMAT] Protocol: run 'make setup', then re-run 'make fmt' until it passes." >&2
  exit 1
fi

if ! "$BIOME_BIN" format --write .; then
  echo "[FORMAT] FAIL: Biome could not apply formatting changes." >&2
  echo "[FORMAT] Remediation: address the diagnostics above, then retry." >&2
  echo "[FORMAT] Protocol: re-run 'make fmt' until it passes, then run 'make fmtcheck'." >&2
  exit 1
fi

echo "[FORMAT] DONE: formatting applied. Re-run 'make check' before opening PR."
