#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BASE_BRANCH="${BASE:-main}"
AUTO_CLEANUP="${AUTO_CLEANUP:-1}"

bash "$ROOT_DIR/tools/agent/pr_ready.sh"

if ! command -v gh >/dev/null 2>&1; then
  echo "[PR-SUBMIT] FAIL: GitHub CLI (gh) is required." >&2
  exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "[PR-SUBMIT] FAIL: gh is not authenticated." >&2
  echo "[PR-SUBMIT] Remediation: run 'gh auth login' and retry." >&2
  exit 1
fi

BRANCH="$(git -C "$ROOT_DIR" rev-parse --abbrev-ref HEAD)"

if gh pr view --json url >/tmp/unslop-pr-view.json 2>/dev/null; then
  URL="$(sed -n 's/.*"url":"\([^"]*\)".*/\1/p' /tmp/unslop-pr-view.json | head -n 1)"
  echo "[PR-SUBMIT] PASS: PR already exists for branch '$BRANCH': ${URL:-unknown}" >&2
  if [ "$AUTO_CLEANUP" = "1" ]; then
    bash "$ROOT_DIR/tools/agent/post_pr_cleanup.sh"
  fi
  exit 0
fi

MARKER_PATH="$(git -C "$ROOT_DIR" rev-parse --git-path unslop-workflow.json)"
ACTIVE_PLAN_REL="$(sed -n 's/.*"plan_path"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$MARKER_PATH" | head -n 1)"
COMPLETED_PLAN_REL="${ACTIVE_PLAN_REL/docs\/exec-plans\/active/docs\/exec-plans\/completed}"
COMPLETED_PLAN_ABS="$ROOT_DIR/$COMPLETED_PLAN_REL"

TITLE="${PR_TITLE:-$(git -C "$ROOT_DIR" log -1 --pretty=%s)}"
BODY_FILE="$(mktemp /tmp/unslop-pr-body.XXXXXX.md)"
trap 'rm -f "$BODY_FILE" /tmp/unslop-pr-view.json' EXIT

{
  echo "## Summary"
  echo "- Complete ${BRANCH} delivery flow with worktree + plan lifecycle enforcement."
  echo
  echo "## Governing Specs"
  grep -E '^- Spec: ' "$COMPLETED_PLAN_ABS" | sed 's/^- /- /'
  echo
  echo "## Execution Plan"
  echo "- ${COMPLETED_PLAN_REL}"
  echo
  echo "## Verification"
  awk '/^## Verification/{flag=1; next} /^## /{flag=0} flag {print}' "$COMPLETED_PLAN_ABS"
} > "$BODY_FILE"

URL="$(gh pr create --base "$BASE_BRANCH" --head "$BRANCH" --title "$TITLE" --body-file "$BODY_FILE")"

echo "[PR-SUBMIT] PASS: PR created: $URL"

if [ "$AUTO_CLEANUP" = "1" ]; then
  bash "$ROOT_DIR/tools/agent/post_pr_cleanup.sh"
fi
