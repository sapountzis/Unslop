---
owner: agent
status: completed
created: 2026-02-22
completed: 2026-02-22
---

# Plan: linkedin_text_cleanup_minimal

## Context
Links:
- Spec: docs/product-specs/extension.md
- Spec: docs/product-specs/spec.md
- Architecture: ARCHITECTURE.md
- Runbook: docs/runbooks/golden-paths.md
- Runbook: docs/exec-plans/README.md

## Workflow
- Init Command: skipped by explicit user instruction; working directly in `/home/andreas/projects/Unslop`
- Worktree: `/home/andreas/projects/Unslop`
- Branch: `main`
- Active Plan: `docs/exec-plans/completed/2026-02-22-linkedin-text-cleanup-minimal.md`
- Status: completed

## Steps
1) Add a minimal LinkedIn-only text cleanup helper that strips obvious feed chrome prefixes/suffixes without relying on brittle DOM structure.
2) Wire the LinkedIn parser to apply cleanup best effort with fallback to raw normalized text when cleanup strips everything.
3) Add focused tests for cleanup strips and prose-preservation behavior.
4) Bump backend and extension versions consistently.
5) Run manual tests and finalize the execution plan.

## Risks
- Regex rules can over-strip valid content; mitigated by conservative start/end anchoring and parser fallback.
- LinkedIn feed wording variants may still leak noise; accepted under best-effort scope.

## Iteration Log
- Iteration 1: implemented `textCleanup.ts`, parser fallback wiring, and parser + cleanup tests; ran manual LinkedIn platform tests.
- Iteration 2: bumped `backend/package.json`, `extension/package.json`, and `extension/manifest.json` from `0.4.1` to `0.4.2`; reran manual LinkedIn platform tests.

## Verification
- `cd extension && bun test src/platforms/linkedin` ✅ pass
- `cd extension && bun test src/platforms/linkedin` ✅ pass (post-version-bump confirmation)
- `cd extension && bunx tsc --noEmit --noUnusedLocals --noUnusedParameters -p tsconfig.json` ⚠️ fails on pre-existing `extension/src/lib/mediaHydration.ts:103` unused `imgSelector` (unrelated to this change)

## PR
- PR: not opened (user requested direct implementation and manual tests only)

## Blockers (optional)
- Command: `cd extension && bunx tsc --noEmit --noUnusedLocals --noUnusedParameters -p tsconfig.json`
- Date: `2026-02-22`
- Environment: local workspace on `main`
- Failure Summary: strict type check fails due an existing unused local not touched by this task.
- Evidence: `src/lib/mediaHydration.ts(103,8): error TS6133: 'imgSelector' is declared but its value is never read.`
- Human input needed: none for this task; proceed with targeted/manual tests per instruction.
- Owner Action: leave unrelated type issue for separate cleanup task.
- Task Status Impact: no impact on LinkedIn parser cleanup behavior or tests.
