#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BRANCH="$(git -C "$ROOT_DIR" rev-parse --abbrev-ref HEAD)"
COMMON_GIT_DIR="$(git -C "$ROOT_DIR" rev-parse --git-common-dir)"
PRIMARY_ROOT="$(cd "$COMMON_GIT_DIR/.." && pwd)"
CLEANUP_LOG="${CLEANUP_LOG:-/tmp/unslop-worktree-cleanup.log}"
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

nohup bash -lc "sleep 1; git -C '$PRIMARY_ROOT' worktree remove '$ROOT_DIR' --force; git -C '$PRIMARY_ROOT' branch -D '$BRANCH' >/dev/null 2>&1 || true" >"$CLEANUP_LOG" 2>&1 &

echo "[PR-CLEANUP] PASS: scheduled local cleanup of linked worktree." >&2
echo "[PR-CLEANUP] Worktree: $ROOT_DIR" >&2
echo "[PR-CLEANUP] Branch: $BRANCH" >&2
echo "[PR-CLEANUP] Log: $CLEANUP_LOG" >&2
