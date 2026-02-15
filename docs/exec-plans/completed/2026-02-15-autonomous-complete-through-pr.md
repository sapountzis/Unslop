---
owner: agent
status: completed
created: 2026-02-15
completed: 2026-02-15
---

# Plan: autonomous_complete_through_pr

## Context
Links:
- Spec: docs/product-specs/agent-workflow.md
- Architecture: ARCHITECTURE.md
- Runbook: docs/runbooks/golden-paths.md

## Workflow
- Init Command: `make init-feature FEATURE=autonomous-complete-through-pr`
- Worktree: `/tmp/unslop-worktrees/autonomous-complete-through-pr`
- Branch: `feat/autonomous-complete-through-pr`
- Active Plan: `docs/exec-plans/active/2026-02-15-autonomous-complete-through-pr.md`
- Status: completed

## Steps
1) Update agent-facing workflow docs/instructions to require autonomous progression through `make pr-ready` then `make pr-submit` by default.
2) Perform instruction-pruning pass (duplication, low-level implementation leakage, contradictions, verbosity) across workflow docs and fold updates into the same change.
3) Update harness messaging/templates so generated plans and init output reinforce the autonomous completion path and blocker exceptions.
4) Run `make check`, capture evidence, finalize the plan lifecycle, and submit PR.

## Risks
- Over-constraining instructions could force PR attempts in cases where human policy/security/product decisions are required.

## Iteration Log
- Iteration 1: context gathered; pending first edit -> make check -> review loop.
- Iteration 2: updated AGENTS/runbooks/spec/template instructions for autonomous `pr-ready` -> `pr-submit` flow and pruned redundant workflow wording; pending full validation.
- Iteration 3: tightened pruning by replacing duplicated procedural content with explicit references to canonical docs (`docs/runbooks/golden-paths.md`, `docs/exec-plans/README.md`) and re-validated.
- Iteration 4: ran final full-gate validation after pruning adjustments and prepared branch for PR submission workflow.

## Verification
- `make check` (2026-02-15): PASS
- `make check` after first pruning pass (2026-02-15): PASS
- `make check` after reference-first pruning adjustments (2026-02-15): PASS

## PR
- PR: https://github.com/sapountzis/Unslop/pull/6

## Blockers (optional)
- Use docs/exec-plans/README.md blocker exception format when blocked.
