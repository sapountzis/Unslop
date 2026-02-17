---
owner: agent
status: completed
created: 2026-02-15
completed: 2026-02-15
---

# Plan: worktree_pr_flow_enforcement

## Context
Links:
- Spec: docs/product-specs/agent-workflow.md
- Spec: docs/product-specs/infra.md
- Architecture: ARCHITECTURE.md
- Runbook: docs/runbooks/golden-paths.md

## Workflow
- Init Command: `make init-feature FEATURE=worktree-pr-flow-enforcement`
- Worktree: `/tmp/unslop-worktrees/worktree-pr-flow-enforcement`
- Branch: `feat/worktree-pr-flow-enforcement`
- Active Plan: `docs/exec-plans/active/2026-02-15-worktree-pr-flow-enforcement.md`
- Status: completed

## Steps
1) Completed: added/linked governing workflow spec and refreshed workflow docs.
2) Completed: added `init-feature` tooling to create linked worktree, feature branch, workflow marker, seeded active plan template, env bootstrap, and setup bootstrap.
3) Completed: added `workflow` harness gate and wired it into `make check`.
4) Completed: extended `taskflow` gate with workflow evidence checks for iterative edit/check/review loops.
5) Completed: added PR readiness/submission tooling, PR template, and post-submit local cleanup automation.
6) Completed: ran required checks and captured verification evidence.
7) Completed: finalized plan lifecycle to completed.

## Risks
- Local-vs-CI behavior can diverge if worktree checks are not CI-aware.
- Overly rigid branch/worktree rules could block legitimate maintenance workflows.
- Plan-validation requirements could be too strict and produce false positives.

## Iteration Log
- Iteration 1: gathered context and reviewed existing harness/taskflow/docs constraints before edits.
- Iteration 2: implemented init/workflow/pr tooling, ran make check dry-run planning, then review pass on scripts and docs.
- Iteration 3: ran `CI=1 make check`, reviewed workflow failure-path diagnostics with `make workflow`, and finalized documentation updates.
- Iteration 4: enhanced init bootstrap (`make setup` + env file setup), added post-submit cleanup automation, reran `make check`, and reviewed cleanup behavior in dry-run mode.

## Verification
- `bun run ./tools/agent/workflow_check.ts` with `CI=1` (pass; CI-safe skip behavior validated for local primary-checkout development)
- `bun run ./tools/agent/taskflow_check.ts` with `CI=1` (pass)
- `make fmt` with `CI=1` (pass; formatted `tools/agent/workflow_check.ts`)
- `make check` with `CI=1` (pass with escalated permissions outside sandbox; UI gate required local port binding)
- `make init-feature FEATURE=workflow-enforcement-smoke WORKTREE_ROOT=/tmp/unslop-worktrees-smoke` (pass; creates linked worktree + seeded active plan + explicit fill-details warning)
- `git worktree remove /tmp/unslop-worktrees-smoke/workflow-enforcement-smoke --force && git branch -D feat/workflow-enforcement-smoke` (pass; smoke artifacts cleaned)
- `make workflow` (expected fail from primary checkout; confirms actionable remediation for missing linked worktree/marker/branch policy)
- `make taskflow` (pass)
- `make setup` from linked worktree (pass; required when worktree had no installed dependencies)
- `make test` from linked worktree after env bootstrap (pass)
- `make check` from linked worktree (pass)
- `DRY_RUN=1 make pr-cleanup` from linked worktree (pass; reports scheduled cleanup target without deleting current worktree)

## PR
- PR: https://github.com/sapountzis/Unslop/pull/3

## Blockers (optional)
- None.
