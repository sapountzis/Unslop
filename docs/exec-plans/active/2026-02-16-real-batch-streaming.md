---
owner: agent
status: active
created: 2026-02-16
---

# Plan: real_batch_streaming

## Context
Links:
- Spec: docs/product-specs/api.md
- Spec: docs/product-specs/spec.md
- Spec: docs/product-specs/extension.md
- Architecture: ARCHITECTURE.md
- Runbook: docs/runbooks/golden-paths.md

## Workflow
- Init Command: `make init-feature FEATURE=real-batch-streaming` (skipped by explicit user instruction; already operating in existing task branch/worktree)
- Worktree: `/home/andreas/projects/Unslop`
- Branch: `feat/uslp-32-reddit-support`
- Active Plan: `docs/exec-plans/active/2026-02-16-real-batch-streaming.md`
- Status: implementation complete; verification and blocker documentation updated
- Autonomy: Continue through implementation and verification, then await user direction for commit/push.

## Steps
1) Refactor classification service batch API from buffered-array return to streaming-first per-item emission with bounded concurrency and preserved quota/cache/event/activity correctness.
2) Update classify batch route to emit NDJSON lines immediately as service outcomes arrive and fail-open unresolved posts on catastrophic stream failure.
3) Update backend tests (service, route, dependency wiring) to assert incremental streaming semantics and maintained side-effect invariants.
4) Update governing API spec to document immediate per-item NDJSON emission behavior and refresh `last_verified`.
5) Cleanup step: remove temporary artifacts/logging scaffolding, ensure no debug-only changes remain, and run focused/backend verification commands.

## Risks
- Concurrency changes can accidentally emit duplicate or missing outcomes; tests must assert one outcome per post.
- Persistence side effects (events/activity/cache) can regress when shifting from end-batch aggregation to per-item streaming.
- Stream error handling must fail-open only unresolved items and avoid conflicting duplicate lines.

## Iteration Log
- Iteration 1: confirmed current root cause (`/v1/classify/batch` route waits for full `classifyBatch` completion before enqueueing NDJSON) and drafted streaming-first refactor/test plan; next loop is edit -> make check -> review.
- Iteration 2: edited backend classification service and classify route to remove buffered batch contract and emit per-item outcomes immediately via `classifyBatchStream`; updated route/service/dependency tests to the new contract and added unresolved-post fail-open route coverage.
- Iteration 3: updated API spec batch behavior to explicitly require immediate per-item NDJSON emission and refreshed spec `last_verified`.
- Iteration 4: cleanup sweep completed (no temporary debug instrumentation introduced in this change; touched files constrained to service/route/tests/spec + active plan). Verification loop executed with targeted tests passing.
- Iteration 5: cleaned formatting/indentation artifacts in touched tests and reran the targeted backend suite to confirm no regressions.
- Iteration 6: removed remaining batch-era leftovers by deleting unused `insertActivities` repository API and collapsing duplicated batch miss logic into the single miss path (`classifyMiss`) used by stream workers; reran targeted backend tests (pass).

## Verification
- `cd backend && bun test src/services/classification-service.test.ts src/routes/classify.test.ts src/app/dependencies.test.ts` (pass; 30 tests, 0 failures).
- `cd backend && bun test src/routes/classify.test.ts src/services/classification-service.test.ts src/app/dependencies.test.ts` (pass; rerun after route formatting cleanup, 30 tests, 0 failures).
- `make check` (fail: workflow gate requires linked worktree + workflow marker; see blocker details).

## PR
- PR: pending (replace with PR URL after `make pr-submit`, or record blocker context)

## Blockers (optional)
- Command: `make check`
- Date: `2026-02-16`
- Environment: `local primary checkout (not linked worktree)`
- Failure Summary: Workflow gate rejects running quality checks from primary checkout and requires `.git/unslop-workflow.json` marker from `make init-feature`.
- Evidence: `[WORKFLOW] ERROR: code changes must be validated from a linked worktree, not the primary checkout` and `[WORKFLOW] ERROR: workflow marker is missing`.
- Human input needed: Do you want me to run `make init-feature FEATURE=real-batch-streaming`, migrate this work into the linked worktree, and rerun `make check`/`make pr-ready` there?
- Owner Action: Human confirms whether to enforce full workflow migration now or proceed with targeted verification evidence only.
- Task Status Impact: Implementation is complete and tested for touched backend scope; plan remains active until workflow-gated verification path is explicitly chosen.
