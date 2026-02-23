---
owner: agent
status: completed
created: 2026-02-23
completed: 2026-02-23
---

# Plan: linkedin_cleanup_v2

## Context
Links:
- Spec: docs/product-specs/extension.md
- Spec: docs/product-specs/spec.md
- Architecture: ARCHITECTURE.md
- Runbook: docs/runbooks/golden-paths.md
- Runbook: docs/exec-plans/README.md
- Runbook: docs/runbooks/docs-freshness.md

## Workflow
- Init Command: `make init-feature FEATURE=linkedin-cleanup-v2`
- Worktree: `/tmp/unslop-worktrees/linkedin-cleanup-v2`
- Branch: `feat/linkedin-cleanup-v2`
- Active Plan: `docs/exec-plans/active/2026-02-23-linkedin-cleanup-v2.md`
- Status: completed (implementation + verification complete in worktree)
- Autonomy: Continue through `make pr-ready` then `make pr-submit` unless blocked or human input is required.

## Steps
1) Refactor LinkedIn text cleanup into a unified staged pipeline that preserves existing filtering behavior and adds new LinkedIn feed-noise stripping heuristics (double names, follower counts, posted-time metadata, job update labels, interaction rails, comment/repost counts, automated reaction suggestions, and following/verified metadata).
2) Keep parser behavior fail-open and backwards-compatible by using cleanup best effort with normalized fallback semantics unchanged.
3) Add focused LinkedIn cleanup regressions for existing behavior plus the new user-provided noise examples and edge cases.
4) Run extension LinkedIn test suite, then repository gates (`make check`, `make pr-ready`, `make pr-submit`) and record outcomes.

## Risks
- Over-stripping legitimate post prose when metadata-like tokens appear in normal text; mitigate with anchored leading/trailing rules, staged cleanup, and prose-preservation tests.
- LinkedIn wording variants may still leak uncommon chrome; mitigate with iterative bounded rules and fixture-driven follow-up.

## Iteration Log
- Iteration 1: context gathered; finalized unified-v2 cleanup design preserving existing behavior + adding new stripping scope.
- Iteration 2: edit (`extension/src/platforms/linkedin/textCleanup.ts`, `extension/src/platforms/linkedin/textCleanup.test.ts`, `extension/src/platforms/linkedin/parser.test.ts`) -> `cd extension && bun test src/platforms/linkedin/textCleanup.test.ts src/platforms/linkedin/parser.test.ts` (initial fail: trailing counts + promoted header edge case) -> review (identified over-greedy action token pattern and missing glued follower-token normalization).
- Iteration 3: edit (`extension/src/platforms/linkedin/textCleanup.ts`) -> `cd extension && bun test src/platforms/linkedin/textCleanup.test.ts src/platforms/linkedin/parser.test.ts` (pass) -> review (confirmed existing + new cleanup regressions are green).
- Iteration 4: edit (`CHANGELOG.md`, active plan evidence updates) -> `make check` (initial fail on formatting, fixed via `make fmt`; second fail on missing changelog evidence, remediated) -> review (taskflow expectations satisfied in plan/changelog).
- Iteration 5: edit (`extension/src/platforms/linkedin/textCleanup.test.ts` fallback-path coverage) -> `cd extension && bun test src/platforms/linkedin/textCleanup.test.ts src/platforms/linkedin/parser.test.ts` (pass) -> review (covered over-strip fallback behavior without changing cleanup logic).
- Iteration 6: verification sweep -> `make check` (pass) -> review (all gates green for current uncommitted change set).

## Verification
- `cd extension && bun test src/platforms/linkedin/textCleanup.test.ts src/platforms/linkedin/parser.test.ts` ✅ pass (25 tests)
- `cd extension && bun test src/platforms/linkedin` ✅ pass (39 tests)
- `make fmt` ✅ pass
- `make check` ✅ pass

## PR
- PR: pending (intentionally paused before commit/submission per user instruction)

## Blockers (optional)
- Use docs/exec-plans/README.md blocker exception format when blocked.
