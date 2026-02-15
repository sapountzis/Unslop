---
owner: agent
status: active
created: 2026-02-16
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
2) Run `make check`, then `make pr-ready` and `make pr-submit` (or record blocker evidence if submission is blocked).

## Risks
- Wording could conflict with existing blocker/escalation behavior if not phrased to keep "stop and report blocker" semantics.

## Iteration Log
- Iteration 1: context gathered; pending first edit -> make check -> review loop.
- Iteration 2: edit (`AGENTS.md`, `docs/runbooks/golden-paths.md`) -> make check (pass) -> review (confirmed explicit no-bypass golden-path rule in canonical agent docs and runbook).

## Verification
- `make check` (pass)
- `make pr-ready` (expected fail before commit: working tree has unstaged or staged changes)

## PR
- PR: pending (replace with PR URL after `make pr-submit`, or record blocker context)

## Blockers (optional)
- Use docs/exec-plans/README.md blocker exception format when blocked.
