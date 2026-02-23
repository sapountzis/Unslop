---
owner: agent
status: completed
created: 2026-02-23
completed: 2026-02-23
---

# Plan: linkedin_follow_prefix_cleanup_v3

## Context
Links:
- Spec: docs/product-specs/extension.md
- Spec: docs/product-specs/agent-workflow.md
- Architecture: ARCHITECTURE.md
- Runbook: docs/runbooks/golden-paths.md

## Workflow
- Init Command: `make init-feature FEATURE=linkedin-follow-prefix-cleanup-v3`
- Worktree: `/tmp/unslop-worktrees/linkedin-follow-prefix-cleanup-v3`
- Branch: `feat/linkedin-follow-prefix-cleanup-v3`
- Active Plan: `docs/exec-plans/active/2026-02-23-linkedin-follow-prefix-cleanup-v3.md`
- Status: completed; pending PR metadata update after submission
- Autonomy: Continue through `make pr-ready` then `make pr-submit` unless blocked or human input is required.

## Steps
1) Add LinkedIn cleanup regression tests for follow-prefix leakage (`...other connections follow...`) and ensure existing noise cleanup behavior remains intact.
2) Refactor LinkedIn cleanup into unified staged rules that preserve existing filtering while adding robust actor-follow metadata stripping, then verify with targeted and full checks.

## Risks
- Over-aggressive prefix stripping could remove valid prose containing "follow/follows/following"; mitigate with start-anchored metadata-specific rules and prose-preservation tests.

## Iteration Log
- Iteration 1: context gathered -> added cleanup + parser regression tests for follow-prefix leakage -> `cd extension && bun test src/platforms/linkedin/textCleanup.test.ts src/platforms/linkedin/parser.test.ts` (fail: 3 expected red tests) -> review (confirmed blind spot in follow-prefix handling).
- Iteration 2: implemented initial follow-prefix regex rules -> `cd extension && bun test src/platforms/linkedin/textCleanup.test.ts src/platforms/linkedin/parser.test.ts` (fail: over-greedy strip caused fallback to noisy normalized text) -> review (root cause: prefix rule consumed body tokens and triggered fallback guard).
- Iteration 3: replaced regex with deterministic token-based follow-prefix stripper scoped to LinkedIn follow-topic metadata; kept existing staged cleanup rules intact -> `cd extension && bun test src/platforms/linkedin/textCleanup.test.ts src/platforms/linkedin/parser.test.ts` (pass) -> review (new follow-prefix cases clean; prose-preservation case remains green).
- Iteration 4: broader verification -> `cd extension && bun test src/platforms/linkedin` (pass) -> `make check` (fail: formatting) -> `make fmt` -> `make check` (fail: changelog-required taskflow gate) -> review (identified missing root changelog update and pending plan verification evidence update).
- Iteration 5: documentation refinement request -> updated LinkedIn cleanup file header docs and replaced ambiguous "chrome" naming with "UI noise" across extension cleanup tests/comments/user-facing diagnostics copy -> `make check` (pass) -> review (no behavior regressions; naming harmonized).
- Iteration 6: workflow-doc rule request -> updated `docs/runbooks/golden-paths.md` and `docs/product-specs/agent-workflow.md` to require backend + extension version bumps before `make pr-ready`; refreshed spec `last_verified` -> `make check` (pass).
- Iteration 7: applied required pre-PR version bump (`backend/package.json`, `extension/package.json`, `extension/manifest.json` from `0.4.3` to `0.4.4`) -> updated `CHANGELOG.md` -> `make check` (pass) -> review (ready for `make pr-ready` and `make pr-submit`).

## Verification
- `cd extension && bun test src/platforms/linkedin/textCleanup.test.ts src/platforms/linkedin/parser.test.ts` (pass after implementation; 29 pass / 0 fail)
- `cd extension && bun test src/platforms/linkedin` (pass; 44 pass / 0 fail)
- `make check` (pass after cleanup naming/docs updates)
- `make check` (pass after workflow-doc rule edits)
- `make check` (pass after required pre-PR version bump to `0.4.4`)

## PR
- PR: pending (replace with PR URL after `make pr-submit`, or record blocker context)

## Blockers (optional)
- Use docs/exec-plans/README.md blocker exception format when blocked.
