---
owner: agent
status: completed
created: 2026-02-15
completed: 2026-02-15
---

# Plan: fast_check_default

## Context
Links:
- Spec: docs/product-specs/agent-workflow.md
- Architecture: ARCHITECTURE.md
- Runbook: docs/runbooks/golden-paths.md

## Workflow
- Init Command: `make init-feature FEATURE=fast-check-default`
- Worktree: `/tmp/unslop-worktrees/fast-check-default`
- Branch: `feat/fast-check-default`
- Active Plan: `docs/exec-plans/active/2026-02-15-fast-check-default.md`
- Status: completed; pending PR submission

## Steps
1) Completed: baselined current type-check flow across harness commands, package scripts, and CI workflows, then selected integration points.
2) Completed: implemented faster default type-check path for `make check` and package-level type commands.
3) Completed: updated docs/spec references while removing low-level implementation details from agent-facing docs.
4) Completed: ran verification gates and captured evidence.
5) Completed: finalized lifecycle and prepared branch for `make pr-submit`.

## Risks
- Type-check engine parity gaps could create false negatives/positives for some projects.
- Default-fast behavior must preserve `make check` reliability and deterministic failure diagnostics.

## Iteration Log
- Iteration 1: gathered context on `make check`/type gates, edited harness + package scripts, ran `make setup`, reviewed dependency/install behavior.
- Iteration 2: audited docs for unnecessary implementation detail exposure, simplified docs, ran `make type`, reviewed output.
- Iteration 3: ran `make check`, reviewed failing type-log race caused by concurrent verification invocation, re-ran verification sequentially.
- Iteration 4: re-ran `make type` and `make check` sequentially (pass), reviewed final diffs for scope and policy alignment.

## Verification
- `make setup` (pass)
- `make type` (pass)
- `make check` (pass)

## PR
- PR: pending

## Blockers (optional)
- Use docs/exec-plans/README.md blocker exception format when blocked.
