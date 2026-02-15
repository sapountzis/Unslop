---
owner: unslop
status: verified
last_verified: 2026-02-15
---

# Agent Workflow Enforcement

## problem
Agent-driven delivery must follow a deterministic path from feature request to PR submission so work is isolated, reviewable, and repeatable.

## non_goals
- Replacing git hosting workflows outside standard branch + PR practices.
- Adding project-management dashboards or external workflow orchestration tools.

## acceptance_criteria
- AC1: Feature implementation starts from an explicit initialization command that creates a linked worktree and feature branch.
- AC2: Initialization seeds an active execution plan template and requires task details to be filled before coding.
- AC3: Harness checks fail when code changes are made outside the required worktree + branch flow.
- AC4: Taskflow checks require execution-plan evidence of iterative edit/check/review loops.
- AC5: PR submission tooling validates readiness and preserves links to governing specs and execution plans.

## constraints
- Local workflows must remain deterministic and produce actionable failure diagnostics.
- CI workflows must remain compatible with non-worktree checkouts.
- Enforcement must integrate into `make check` and existing harness gates.

## telemetry
- Logs: Harness emits explicit workflow, taskflow, and readiness gate errors.
- Metrics: Check/ready command success-failure outcomes observable in CI logs.
- Traces: N/A.

## test_plan
- Unit: script-level validation for branch/worktree markers and plan-content checks.
- Integration: `make check` includes workflow and taskflow gates for code-change diffs.
- E2E: init command -> edit/check/review loop -> PR-ready validation.

## rollout
- Flags: No runtime flags.
- Migration: Existing docs and templates updated to the new required sequence.
- Backout: Remove workflow gate wiring from `make check` if false positives block delivery.
