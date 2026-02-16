---
owner: agent
status: active
created: 2026-02-16
---

# Plan: extension_staged_pipeline

## Context
Links:
- Spec: docs/product-specs/extension.md
- Spec: docs/product-specs/api.md
- Spec: docs/product-specs/spec.md
- Architecture: ARCHITECTURE.md
- Runbook: docs/runbooks/golden-paths.md

## Workflow
- Init Command: `make init-feature FEATURE=extension-staged-pipeline` (skipped by explicit user instruction; continue in existing branch/worktree)
- Worktree: `/home/andreas/projects/Unslop`
- Branch: `feat/uslp-32-reddit-support`
- Active Plan: `docs/exec-plans/active/2026-02-16-extension-staged-pipeline.md`
- Status: implementation + verification

## Steps
1) Completed: define staged extension pipeline contracts (attachment concurrency limit, attachment deadline budget, micro-batch size/window, fail-open fallback).
2) Completed: implement payload-agnostic batching primitive (`windowed-batcher`) with unit tests.
3) Completed: refactor background classify orchestration to staged incremental dispatch (`classify-pipeline.ts`) using `p-limit` for bounded attachment concurrency.
4) Not required: content `batch-queue` contract remained valid and unchanged (3s fail-open authority is preserved there).
5) Completed: add focused background tests for concurrency cap, incremental dispatch, deadline fail-open, and classify-request fail-open behavior.
6) Completed: remove runtime dependency on legacy "resolve whole batch before classify" path, refresh extension README, and run verification.

## Risks
- Stage orchestration changes can regress exactly-once per-post resolution if correlation contracts are not enforced.
- Over-abstraction can add complexity; primitives must stay minimal and explicit.
- Timer-driven behavior can be flaky in tests without deterministic time controls.

## Iteration Log
- Iteration 1: established architectural direction and created active plan template.
- Iteration 2: implemented `windowed-batcher` + tests and `classify-pipeline` with `p-limit` bounded attachment concurrency; wired background runtime to staged dispatch; edit -> `bun test src/background src/lib/windowed-batcher.test.ts` -> review.
- Iteration 3: removed runtime dependence on legacy whole-batch attachment resolution, updated attachment resolver tests to post-level API, and updated extension docs; edit -> `bun run check:type` -> review.
- Iteration 4: verification pass; `make check` blocked by explicit workflow guard because task is intentionally running in primary checkout (per user instruction to skip `make init-feature`).
- Iteration 5: full extension regression pass after final cleanup; edit -> `bun test src/` -> review.
- Iteration 6: synchronized static dispatch constants with architecture (set `BATCH_MAX_INFLIGHT_REQUESTS=2`, updated README configuration/module docs), then reran full extension verification.

## Verification
- `cd extension && bun test src/background src/lib/windowed-batcher.test.ts` (pass, 17 tests)
- `cd extension && bun test src/` (pass, 162 tests)
- `cd extension && bun test src/` (pass, 163 tests after in-flight cap update)
- `cd extension && bun run check:type` (pass)
- `cd extension && bun run check:lint` (pass with existing repository warnings)
- `cd extension && bun run check:fmt:verify` (fails on pre-existing `extension/src/lib/config.ts` formatting drift unrelated to this change)
- `make check` (blocked by workflow guard requiring linked worktree + workflow marker; matches explicit user instruction to skip `make init-feature`)

## PR
- PR: pending (replace with PR URL after `make pr-submit`, or record blocker context)

## Blockers (optional)
- Command: `make check`
- Date: `2026-02-16`
- Environment: local sandbox in primary checkout (no linked-worktree marker by user direction)
- Failure Summary: workflow gate rejects running checks from primary checkout without `make init-feature`.
- Evidence: `[WORKFLOW] ERROR: code changes must be validated from a linked worktree, not the primary checkout`
- Human input needed: confirm whether to keep this task in primary checkout with targeted verification only, or allow linked-worktree initialization for full workflow gates.
- Owner Action: proceed with targeted extension verification unless user authorizes workflow-initialized worktree.
- Task Status Impact: implementation is complete and tested at extension scope; full workflow-gated checks remain blocked by explicit process constraint.
