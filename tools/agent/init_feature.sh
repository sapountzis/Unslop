#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
FEATURE_SLUG="${1:-${FEATURE:-}}"
BASE_BRANCH="${2:-${BASE:-}}"
WORKTREE_ROOT="${3:-${WORKTREE_ROOT:-/tmp/unslop-worktrees}}"
BRANCH_PREFIX="${BRANCH_PREFIX:-feat}"
AUTO_SETUP="${AUTO_SETUP:-1}"
BOOTSTRAP_ENV="${BOOTSTRAP_ENV:-1}"
AUTO_SYNC_BASE="${AUTO_SYNC_BASE:-1}"
BASE_REF=""

usage() {
  cat <<USAGE >&2
Usage: make init-feature FEATURE=<slug> [BASE=<main|master>] [WORKTREE_ROOT=/tmp/unslop-worktrees] [BRANCH_PREFIX=feat] [AUTO_SETUP=1] [BOOTSTRAP_ENV=1] [AUTO_SYNC_BASE=1]
USAGE
}

resolve_base_ref() {
  local remote_ref="refs/remotes/origin/${BASE_BRANCH}"

  if [ "$AUTO_SYNC_BASE" != "1" ]; then
    if git -C "$ROOT_DIR" show-ref --verify --quiet "$remote_ref"; then
      BASE_REF="origin/${BASE_BRANCH}"
      return
    fi
    if git -C "$ROOT_DIR" show-ref --verify --quiet "refs/heads/${BASE_BRANCH}"; then
      BASE_REF="${BASE_BRANCH}"
      return
    fi
    echo "[INIT] FAIL: BASE branch not found locally or on origin: ${BASE_BRANCH}" >&2
    exit 1
  fi

  if ! git -C "$ROOT_DIR" remote get-url origin >/dev/null 2>&1; then
    echo "[INIT] FAIL: git remote 'origin' is required for base sync." >&2
    echo "[INIT] Remediation: add origin remote or re-run with AUTO_SYNC_BASE=0 and explicit BASE=<local-branch>." >&2
    exit 1
  fi

  echo "[INIT] Syncing latest base from origin/${BASE_BRANCH}..."
  if ! git -C "$ROOT_DIR" fetch origin "${BASE_BRANCH}"; then
    echo "[INIT] FAIL: unable to fetch latest base branch from origin/${BASE_BRANCH}." >&2
    echo "[INIT] Remediation: verify network/auth and rerun init." >&2
    exit 1
  fi

  if git -C "$ROOT_DIR" show-ref --verify --quiet "$remote_ref"; then
    BASE_REF="origin/${BASE_BRANCH}"
    return
  fi

  if git -C "$ROOT_DIR" show-ref --verify --quiet "refs/heads/${BASE_BRANCH}"; then
    BASE_REF="${BASE_BRANCH}"
    echo "[INIT] WARN: remote ref origin/${BASE_BRANCH} unavailable; falling back to local ${BASE_BRANCH}." >&2
    return
  fi

  echo "[INIT] FAIL: BASE branch not found after sync: ${BASE_BRANCH}" >&2
  exit 1
}

bootstrap_env_file() {
  local rel_path="$1"
  local source_env="$ROOT_DIR/$rel_path"
  local target_env="$WORKTREE_PATH/$rel_path"
  local source_example="${source_env}.example"
  local target_example="${target_env}.example"

  if [ -f "$target_env" ]; then
    return
  fi

  if [ -f "$source_env" ]; then
    cp "$source_env" "$target_env"
    echo "[INIT] Bootstrapped env file from primary checkout: $rel_path"
    return
  fi

  if [ -f "$target_example" ]; then
    cp "$target_example" "$target_env"
    echo "[INIT] Bootstrapped env file from template: ${rel_path}.example -> ${rel_path}"
    return
  fi

  if [ -f "$source_example" ]; then
    cp "$source_example" "$target_env"
    echo "[INIT] Bootstrapped env file from primary template: ${rel_path}.example -> ${rel_path}"
  fi
}

if [ -z "$FEATURE_SLUG" ]; then
  usage
  exit 64
fi

if ! [[ "$FEATURE_SLUG" =~ ^[a-z0-9][a-z0-9-]*$ ]]; then
  echo "[INIT] FAIL: FEATURE slug must match ^[a-z0-9][a-z0-9-]*$" >&2
  exit 64
fi

if ! [[ "$BRANCH_PREFIX" =~ ^(feat|fix|chore|docs|refactor)$ ]]; then
  echo "[INIT] FAIL: BRANCH_PREFIX must be one of feat|fix|chore|docs|refactor." >&2
  exit 64
fi

if [ -z "$BASE_BRANCH" ]; then
  if git -C "$ROOT_DIR" show-ref --verify --quiet refs/heads/main; then
    BASE_BRANCH="main"
  elif git -C "$ROOT_DIR" show-ref --verify --quiet refs/heads/master; then
    BASE_BRANCH="master"
  else
    echo "[INIT] FAIL: unable to infer BASE branch; pass BASE=<branch>." >&2
    exit 64
  fi
fi

BRANCH_NAME="${BRANCH_PREFIX}/${FEATURE_SLUG}"
WORKTREE_PATH="${WORKTREE_ROOT%/}/${FEATURE_SLUG}"

if git -C "$ROOT_DIR" show-ref --verify --quiet "refs/heads/${BRANCH_NAME}"; then
  echo "[INIT] FAIL: branch already exists: ${BRANCH_NAME}" >&2
  echo "[INIT] Remediation: choose a new FEATURE slug or delete the branch/worktree." >&2
  exit 1
fi

if [ -e "$WORKTREE_PATH" ]; then
  echo "[INIT] FAIL: target worktree path already exists: $WORKTREE_PATH" >&2
  echo "[INIT] Remediation: remove the existing directory or choose a different FEATURE slug." >&2
  exit 1
fi

resolve_base_ref

mkdir -p "$WORKTREE_ROOT"
git -C "$ROOT_DIR" worktree add -b "$BRANCH_NAME" "$WORKTREE_PATH" "$BASE_REF"

TODAY="$(date +%F)"
PLAN_REL="docs/exec-plans/active/${TODAY}-${FEATURE_SLUG}.md"
PLAN_ABS="$WORKTREE_PATH/$PLAN_REL"

mkdir -p "$(dirname "$PLAN_ABS")"
cat > "$PLAN_ABS" <<PLAN
---
owner: agent
status: active
created: ${TODAY}
---

# Plan: ${FEATURE_SLUG//-/_}

## Context
Links:
- Spec: <fill-governing-spec-path>
- Architecture: ARCHITECTURE.md
- Runbook: docs/runbooks/golden-paths.md

## Workflow
- Init Command: \`make init-feature FEATURE=${FEATURE_SLUG}\`
- Worktree: \`${WORKTREE_PATH}\`
- Branch: \`${BRANCH_NAME}\`
- Active Plan: \`${PLAN_REL}\`
- Status: <fill-current-phase>

## Steps
1) <fill-step-1>
2) <fill-step-2>

## Risks
- <fill-risk-1>

## Iteration Log
- Iteration 1: context gathered; pending first edit -> make check -> review loop.

## Verification
- <fill-verification-command-and-outcome>

## PR
- PR: <fill-pr-link-or-pending>

## Blockers (optional)
- Use docs/exec-plans/README.md blocker exception format when blocked.
PLAN

MARKER_PATH="$(git -C "$WORKTREE_PATH" rev-parse --git-path unslop-workflow.json)"
cat > "$MARKER_PATH" <<MARKER
{
  "schema": 1,
  "feature_slug": "${FEATURE_SLUG}",
  "branch": "${BRANCH_NAME}",
  "worktree_path": "${WORKTREE_PATH}",
  "plan_path": "${PLAN_REL}",
  "base_branch": "${BASE_BRANCH}",
  "base_ref": "${BASE_REF}",
  "initialized_at": "${TODAY}"
}
MARKER

if [ "$BOOTSTRAP_ENV" = "1" ]; then
  bootstrap_env_file "backend/.env"
fi

if [ "$AUTO_SETUP" = "1" ]; then
  echo "[INIT] Running make setup in linked worktree..."
  if ! make -C "$WORKTREE_PATH" setup; then
    echo "[INIT] FAIL: setup failed in worktree: $WORKTREE_PATH" >&2
    echo "[INIT] Remediation: run 'make -C \"$WORKTREE_PATH\" setup' and resolve setup errors before development." >&2
    exit 1
  fi
fi

echo "[INIT] PASS: created worktree workflow for '${FEATURE_SLUG}'."
echo "[INIT] Worktree: ${WORKTREE_PATH}"
echo "[INIT] Branch:   ${BRANCH_NAME}"
echo "[INIT] Base Ref: ${BASE_REF}"
echo "[INIT] Plan:     ${PLAN_REL}"
echo "[INIT]"
if [ "$AUTO_SETUP" = "1" ]; then
  echo "[INIT] Setup:    complete (make setup)"
else
  echo "[INIT] Setup:    skipped (AUTO_SETUP=${AUTO_SETUP})"
fi
echo "[INIT] REQUIRED NEXT STEP: fill task details in '${PLAN_REL}' before any code changes."
echo "[INIT] Stop now, edit the plan placeholders, then continue with context gathering and implementation."
echo "[INIT] Suggested commands:"
echo "  cd ${WORKTREE_PATH}"
echo "  sed -n '1,220p' ${PLAN_REL}"
echo "  make check"
