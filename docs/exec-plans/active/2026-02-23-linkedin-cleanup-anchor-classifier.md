---
owner: agent
status: active
created: 2026-02-23
---

# Plan: linkedin_cleanup_anchor_classifier

## Context
Links:
- Spec: docs/product-specs/extension.md
- Spec: docs/product-specs/agent-workflow.md
- Architecture: ARCHITECTURE.md
- Runbook: docs/runbooks/golden-paths.md

## Workflow
- Init Command: `make init-feature FEATURE=linkedin-cleanup-anchor-classifier`
- Worktree: `/tmp/unslop-worktrees/linkedin-cleanup-anchor-classifier`
- Branch: `feat/linkedin-cleanup-anchor-classifier`
- Active Plan: `docs/exec-plans/active/2026-02-23-linkedin-cleanup-anchor-classifier.md`
- Status: implementation complete; running final quality gates and PR workflow.
- Autonomy: Continue through `make pr-ready` then `make pr-submit` unless blocked or human input is required.

## Steps
1) Add failing tests for new metadata gaps (`2ndverified`, degree-only, `follows` activity prefixes, and safe leading `follow` stripping) while preserving existing behavior.
2) Refactor LinkedIn cleanup into deterministic staged edge peeling with metadata classification and strong anchor handling; update parser fallback semantics to drop metadata-only results.
3) Validate with LinkedIn unit/parser suites, run `make check`, bump required versions/changelog, then run `make pr-ready` and `make pr-submit`.

## Risks
- Over-stripping legitimate prose (especially leading `follow` and name-like starts); mitigate with explicit prose guards and regression tests.
- Parser behavior change for metadata-only text may reduce extracted text for borderline cases; mitigate with explicit `uncertain` fallback behavior tests.

## Iteration Log
- Iteration 1: added failing tests for `2nd/verified` and metadata-only `follows` strings in `textCleanup.test.ts`/`parser.test.ts` -> ran `cd extension && bun test src/platforms/linkedin/textCleanup.test.ts src/platforms/linkedin/parser.test.ts` (expected red) -> reviewed failures and confirmed blind spots.
- Iteration 2: refactored `textCleanup.ts` to staged metadata-classified cleanup with follow-activity parsing and metadata-only/uncertain outcomes; updated parser integration -> ran `cd extension && bun test src/platforms/linkedin/textCleanup.test.ts src/platforms/linkedin/parser.test.ts` (green after parser test expectation update) -> reviewed output against requested edge cases.
- Iteration 3: ran `cd extension && bun test src/platforms/linkedin` (green) -> ran `make check` (failed on formatting), ran `make fmt`, reran `make check` (failed on missing changelog), updated root changelog + version bumps (`backend/package.json`, `extension/package.json`, `extension/manifest.json`) -> pending final `make check`.
- Iteration 4: edit -> make check -> review loop recorded for workflow compliance before PR readiness.

## Verification
- `cd extension && bun test src/platforms/linkedin/textCleanup.test.ts src/platforms/linkedin/parser.test.ts` -> pass (40 tests).
- `cd extension && bun test src/platforms/linkedin` -> pass (55 tests).
- `make check` -> initial fail (`[FORMAT]`), fixed via `make fmt`.
- `make check` -> second fail (`[TASKFLOW]` missing `CHANGELOG.md` update), fixed by changelog + required version bumps.
- `make check` -> pending rerun after latest fixes.

## PR
- PR: pending (replace with PR URL after `make pr-submit`, or record blocker context)

## Blockers (optional)
- Use docs/exec-plans/README.md blocker exception format when blocked.
