#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BRANCH="$(git -C "$ROOT_DIR" rev-parse --abbrev-ref HEAD)"
COMMON_GIT_DIR="$(git -C "$ROOT_DIR" rev-parse --git-common-dir)"
PRIMARY_ROOT="$(cd "$COMMON_GIT_DIR/.." && pwd)"
DRY_RUN="${DRY_RUN:-0}"

if [ "$PRIMARY_ROOT" = "$ROOT_DIR" ]; then
  echo "[PR-CLEANUP] SKIP: current checkout is the primary worktree." >&2
  echo "[PR-CLEANUP] Action: no linked worktree removal performed." >&2
  exit 0
fi

if [ "$DRY_RUN" = "1" ]; then
  echo "[PR-CLEANUP] DRY-RUN: would remove linked worktree and local branch." >&2
  echo "[PR-CLEANUP] Primary:  $PRIMARY_ROOT" >&2
  echo "[PR-CLEANUP] Worktree: $ROOT_DIR" >&2
  echo "[PR-CLEANUP] Branch:   $BRANCH" >&2
  exit 0
fi

if ! git -C "$PRIMARY_ROOT" worktree remove "$ROOT_DIR" --force; then
  echo "[PR-CLEANUP] FAIL: unable to remove linked worktree '$ROOT_DIR'." >&2
  echo "[PR-CLEANUP] Remediation: run 'git -C \"$PRIMARY_ROOT\" worktree remove \"$ROOT_DIR\" --force' manually, then retry 'make pr-cleanup'." >&2
  exit 1
fi

if git -C "$PRIMARY_ROOT" show-ref --verify --quiet "refs/heads/$BRANCH"; then
  if ! git -C "$PRIMARY_ROOT" branch -D "$BRANCH" >/dev/null 2>&1; then
    echo "[PR-CLEANUP] FAIL: linked worktree removed but local branch '$BRANCH' could not be deleted." >&2
    echo "[PR-CLEANUP] Remediation: run 'git -C \"$PRIMARY_ROOT\" branch -D \"$BRANCH\"' manually." >&2
    exit 1
  fi
fi

if git -C "$PRIMARY_ROOT" worktree list --porcelain | grep -Fxq "worktree $ROOT_DIR"; then
  echo "[PR-CLEANUP] FAIL: worktree cleanup incomplete; '$ROOT_DIR' is still registered." >&2
  exit 1
fi

echo "[PR-CLEANUP] PASS: linked worktree cleanup completed." >&2
echo "[PR-CLEANUP] Worktree: $ROOT_DIR" >&2
echo "[PR-CLEANUP] Branch: $BRANCH" >&2
