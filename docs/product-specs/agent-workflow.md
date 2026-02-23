---
owner: unslop
status: verified
last_verified: 2026-02-23
---

# Agent Workflow Enforcement

## problem
Agent-driven delivery must follow a deterministic path from feature request to PR submission so work is isolated, reviewable, and repeatable.

## non_goals
- Replacing git hosting workflows outside standard branch + PR practices.
- Adding project-management dashboards or external workflow orchestration tools.

## acceptance_criteria
- AC1: Feature implementation starts from an explicit initialization command that creates a linked worktree and feature branch.
- AC2: Initialization syncs the selected base from `origin`, seeds an active execution plan template, bootstraps required env files, runs setup, and requires task details to be filled before coding.
- AC3: Harness checks fail when code changes are made outside the required worktree + branch flow.
- AC4: Taskflow checks require execution-plan evidence of iterative edit/check/review loops.
- AC5: PR submission tooling validates readiness and preserves links to governing specs and execution plans.
- AC6: PR submission tooling performs verified local linked-worktree cleanup after successful submission.
- AC7: Default agent behavior continues autonomously through `make pr-ready` and `make pr-submit`; agents pause only for explicit blockers or required human input.
- AC8: Top-level agent-facing docs stay abstract and pointer-first; detailed implementation specifics live in canonical runbooks/spec docs.
- AC9: Harness check failures expose gate-specific diagnostics with concrete remediation/retry steps, while happy-path output remains minimal.
- AC10: Before running `make pr-ready`, agents bump versions for both backend and extension in `backend/package.json`, `extension/package.json`, and `extension/manifest.json`.

## constraints
- Local workflows must remain deterministic and produce actionable failure diagnostics.
- CI workflows must remain compatible with non-worktree checkouts.
- Enforcement must integrate into `make check` and existing harness gates.

## telemetry
- Logs: Harness emits explicit workflow, taskflow, and readiness gate errors.
- Metrics: Check/ready/submit command success-failure outcomes observable in CI logs.
- Traces: N/A.

## test_plan
- Unit: script-level validation for branch/worktree markers and plan-content checks.
- Integration: `make check` includes workflow and taskflow gates for code-change diffs.
- E2E: init command -> edit/check/review loop -> `make pr-ready` -> `make pr-submit`.

## rollout
- Flags: No runtime flags.
- Migration: Existing docs and templates updated to the new required sequence.
- Backout: Remove workflow gate wiring from `make check` if false positives block delivery.
