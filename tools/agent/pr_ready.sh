#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BRANCH="$(git -C "$ROOT_DIR" rev-parse --abbrev-ref HEAD)"

if [ "$BRANCH" = "HEAD" ]; then
  echo "[PR-READY] FAIL: detached HEAD is not supported for PR submission." >&2
  exit 1
fi

if [[ "$BRANCH" =~ ^(main|master)$ ]]; then
  echo "[PR-READY] FAIL: branch '$BRANCH' cannot be submitted directly." >&2
  echo "[PR-READY] Remediation: run make init-feature FEATURE=<slug> and work from a feature branch." >&2
  exit 1
fi

if ! git -C "$ROOT_DIR" diff --quiet || ! git -C "$ROOT_DIR" diff --cached --quiet; then
  echo "[PR-READY] FAIL: working tree has unstaged or staged changes." >&2
  echo "[PR-READY] Remediation: commit changes before running make pr-ready." >&2
  exit 1
fi

if [ -n "$(git -C "$ROOT_DIR" ls-files --others --exclude-standard)" ]; then
  echo "[PR-READY] FAIL: untracked files detected." >&2
  echo "[PR-READY] Remediation: commit, move, or remove untracked files before submitting a PR." >&2
  exit 1
fi

MARKER_PATH="$(git -C "$ROOT_DIR" rev-parse --git-path unslop-workflow.json)"
if [ ! -f "$MARKER_PATH" ]; then
  echo "[PR-READY] FAIL: missing workflow marker: $MARKER_PATH" >&2
  echo "[PR-READY] Remediation: initialize with make init-feature FEATURE=<slug>." >&2
  exit 1
fi

ACTIVE_PLAN_REL="$(sed -n 's/.*"plan_path"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$MARKER_PATH" | head -n 1)"
if [ -z "$ACTIVE_PLAN_REL" ]; then
  echo "[PR-READY] FAIL: could not resolve plan_path from workflow marker." >&2
  exit 1
fi

ACTIVE_PLAN_ABS="$ROOT_DIR/$ACTIVE_PLAN_REL"
COMPLETED_PLAN_REL="${ACTIVE_PLAN_REL/docs\/exec-plans\/active/docs\/exec-plans\/completed}"
COMPLETED_PLAN_ABS="$ROOT_DIR/$COMPLETED_PLAN_REL"

if [ -f "$ACTIVE_PLAN_ABS" ]; then
  echo "[PR-READY] FAIL: active plan still present: $ACTIVE_PLAN_REL" >&2
  echo "[PR-READY] Remediation: finalize lifecycle (status: completed + completed date) and move to completed/." >&2
  exit 1
fi

if [ ! -f "$COMPLETED_PLAN_ABS" ]; then
  echo "[PR-READY] FAIL: completed plan not found: $COMPLETED_PLAN_REL" >&2
  echo "[PR-READY] Remediation: move finalized plan into docs/exec-plans/completed/." >&2
  exit 1
fi

if ! grep -Eq '^status:[[:space:]]*completed$' "$COMPLETED_PLAN_ABS"; then
  echo "[PR-READY] FAIL: completed plan frontmatter missing status: completed." >&2
  exit 1
fi

if ! grep -Eq '^completed:[[:space:]]*[0-9]{4}-[0-9]{2}-[0-9]{2}$' "$COMPLETED_PLAN_ABS"; then
  echo "[PR-READY] FAIL: completed plan frontmatter missing completed: YYYY-MM-DD." >&2
  exit 1
fi

if grep -Eq '<fill-[^>]+>' "$COMPLETED_PLAN_ABS"; then
  echo "[PR-READY] FAIL: completed plan still has unresolved template placeholders." >&2
  exit 1
fi

if ! grep -Eq '^- PR:[[:space:]]*.+$' "$COMPLETED_PLAN_ABS"; then
  echo "[PR-READY] FAIL: completed plan must include a PR line under ## PR." >&2
  exit 1
fi

echo "[PR-READY] running make check to verify final readiness..."
(cd "$ROOT_DIR" && make check)

echo "[PR-READY] PASS: branch is PR-ready."
echo "[PR-READY] Completed plan: $COMPLETED_PLAN_REL"
