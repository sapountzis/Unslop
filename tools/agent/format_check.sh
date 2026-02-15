#!/usr/bin/env bash
set -euo pipefail

BIOME_BIN="./node_modules/.bin/biome"

print_protocol() {
  echo "[FORMAT] Protocol: address the failure shown above, then re-run 'make fmtcheck' until it passes." >&2
}

if [ ! -x "$BIOME_BIN" ]; then
  echo "[FORMAT] FAIL: Biome is not installed at '$BIOME_BIN'." >&2
  echo "[FORMAT] Remediation: run 'make setup' to install local tooling dependencies." >&2
  echo "[FORMAT] Protocol: run 'make setup', then re-run 'make fmtcheck' until it passes." >&2
  exit 1
fi

if ! "$BIOME_BIN" format --reporter=summary .; then
  echo "[FORMAT] FAIL: one or more files are not formatted." >&2
  echo "[FORMAT] Remediation: run 'make fmt' to apply formatting changes." >&2
  print_protocol
  exit 1
fi

echo "[FORMAT] PASS: formatting is compliant."
