---
owner: agent
status: completed
created: 2026-02-16
completed: 2026-02-16
---

# Plan: golden_path_no_exceptions

## Context
Links:
- Spec: docs/product-specs/agent-workflow.md
- Architecture: ARCHITECTURE.md
- Runbook: docs/runbooks/golden-paths.md

## Workflow
- Init Command: `make init-feature FEATURE=golden-path-no-exceptions`
- Worktree: `/tmp/unslop-worktrees/golden-path-no-exceptions`
- Branch: `feat/golden-path-no-exceptions`
- Active Plan: `docs/exec-plans/active/2026-02-16-golden-path-no-exceptions.md`
- Status: in_progress
- Autonomy: Continue through `make pr-ready` then `make pr-submit` unless blocked or human input is required.

## Steps
1) Add an explicit hard-stop instruction in agent-facing workflow docs: never violate the golden path for any reason.
2) Fix workflow/taskflow clean-worktree detection so clean `main` does not inherit prior commit file lists.
3) Run `make check`, then `make pr-ready` and `make pr-submit` (or record blocker evidence if submission is blocked).

## Risks
- Wording could conflict with existing blocker/escalation behavior if not phrased to keep "stop and report blocker" semantics.

## Iteration Log
- Iteration 1: context gathered; pending first edit -> make check -> review loop.
- Iteration 2: edit (`AGENTS.md`, `docs/runbooks/golden-paths.md`) -> make check (pass) -> review (confirmed explicit no-bypass golden-path rule in canonical agent docs and runbook).
- Iteration 3: edit (`tools/checks/validators/workflow_check.ts`, `tools/checks/validators/taskflow_check.ts`) -> make check (pass) -> review (confirmed clean-main detectors return empty and stop false-positive workflow/taskflow failures).
- Iteration 4: edit (`tools/checks/validators/workflow_check.ts`) -> make check (pass) -> review (moved dirty-primary-checkout stash guidance from docs into workflow checker remediation output).

## Verification
- `make check` (pass)
- `make pr-ready` (expected fail before commit: working tree has unstaged or staged changes)
- `cd /home/andreas/projects/Unslop && bun /tmp/unslop-worktrees/golden-path-no-exceptions/tools/checks/validators/workflow_check.ts` (pass: `[WORKFLOW] PASS: no changed files detected.` on clean `main`)
- `cd /home/andreas/projects/Unslop && bun /tmp/unslop-worktrees/golden-path-no-exceptions/tools/checks/validators/taskflow_check.ts` (pass: `[TASKFLOW] PASS: no changed files detected.` on clean `main`)
- `cd /home/andreas/projects/Unslop && printf 'const x = 1;\n' > tmp-workflow-remediation-smoke.ts && bun /tmp/unslop-worktrees/golden-path-no-exceptions/tools/checks/validators/workflow_check.ts && rm -f tmp-workflow-remediation-smoke.ts` (expected fail with remediation text that includes stash->init-feature->stash-pop migration guidance; temporary file removed)

## PR
- PR: pending (replace with PR URL after `make pr-submit`, or record blocker context)

## Blockers (optional)
- Use docs/exec-plans/README.md blocker exception format when blocked.
