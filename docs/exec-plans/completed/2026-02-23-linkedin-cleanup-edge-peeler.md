---
owner: agent
status: completed
created: 2026-02-23
completed: 2026-02-23
---

# Plan: linkedin_cleanup_edge_peeler

## Context
Links:
- Spec: docs/product-specs/extension.md
- Spec: docs/product-specs/agent-workflow.md
- Architecture: ARCHITECTURE.md
- Runbook: docs/runbooks/golden-paths.md

## Workflow
- Init Command: `make init-feature FEATURE=linkedin-cleanup-edge-peeler`
- Worktree: `/tmp/unslop-worktrees/linkedin-cleanup-edge-peeler`
- Branch: `feat/linkedin-cleanup-edge-peeler`
- Active Plan: `docs/exec-plans/active/2026-02-23-linkedin-cleanup-edge-peeler.md`
- Status: completed; pending PR metadata update after submission
- Autonomy: Continue through `make pr-ready` then `make pr-submit` unless blocked or human input is required.

## Steps
1) Add failing LinkedIn cleanup tests for leading action-prefix leakage (`follow ...`) and preserve existing cleanup behavior.
2) Refactor cleanup to deterministic boundary peeling (normalize -> leading strip -> trailing strip -> fallback), then run `make check`, `make pr-ready`, and `make pr-submit`.

## Risks
- Leading `follow` stripping could remove legitimate prose; mitigate with prefix-only scope and guardrails plus regression tests.

## Iteration Log
- Iteration 1: context gathered; pending first edit -> make check -> review loop.
- Iteration 2: added failing LinkedIn cleanup/parser tests for leaked `follow ...` prefix -> review confirmed 3 failing tests.
- Iteration 3: refactored `textCleanup.ts` to bounded edge peeling (normalize + leading edge + trailing edge + fallback), added `|` separator normalization, and added follow-action guardrails -> targeted LinkedIn tests green.
- Iteration 4: ran root quality gates; `make check` failed on extension formatting, applied `make fmt`, re-ran `make check` and passed.

## Verification
- `cd extension && bun test src/platforms/linkedin/textCleanup.test.ts src/platforms/linkedin/parser.test.ts` (initial run): fail (expected red phase; 3 follow-prefix tests failing).
- `cd extension && bun test src/platforms/linkedin/textCleanup.test.ts src/platforms/linkedin/parser.test.ts` (post-fix): pass.
- `cd extension && bun test src/platforms/linkedin`: pass.
- `make check` (first run): fail on formatting only (`extension/manifest.json`, `extension/src/platforms/linkedin/textCleanup.ts`, `extension/src/platforms/linkedin/textCleanup.test.ts`).
- `make fmt`: pass.
- `make check` (second run): pass.

## PR
- PR: pending (replace with PR URL after `make pr-submit`, or record blocker context)

## Blockers (optional)
- Use docs/exec-plans/README.md blocker exception format when blocked.
