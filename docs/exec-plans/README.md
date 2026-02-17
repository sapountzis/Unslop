# Execution Plans

Execution plans link product specs to implementation steps.

## Before You Start
1. Run `make init-feature FEATURE=<task-slug>` from the primary checkout (syncs base from origin, creates worktree, seeds plan template, bootstraps env, runs setup).
2. Fill the generated active plan template before editing code.
3. Select the governing spec(s) in `docs/product-specs/index.md`.
4. Review architecture constraints in `ARCHITECTURE.md`.
5. Pull any operational guidance from `docs/runbooks/`.

## Directory Semantics
- `active/`: current in-flight plans.
- `completed/`: finished plans retained for traceability.

## Naming Convention
- Use descriptive names: `docs/exec-plans/active/<yyyy-mm-dd>-<task-slug>.md`.
- Keep one active file per task stream to avoid split context.

## Plan Update Checklist
- Frontmatter is present and current (`owner`, `status`, `created`).
- Context links point to governing specs and architecture/runbooks.
- Workflow metadata is present (`Init Command`, `Worktree`, `Branch`, `Active Plan`).
- Steps reflect current implementation state.
- Risks and verification are updated after each material milestone.
- Iteration Log includes explicit `edit -> make check -> review` loop evidence.
- PR status is current (`pending`, submitted URL, or blocker-linked exception state).
- Completion evidence is captured before moving to `completed/`.

## Definition of Done
- A task is complete when all of the following are true:
  - Governing specs/runbooks/docs are updated to match delivered behavior.
  - `make check` passes from repository root.
  - Plan verification evidence lists the exact commands run and outcomes.
  - Plan includes PR tracking under `## PR` and no unresolved `<fill-...>` placeholders.
  - `make pr-ready` and `make pr-submit` have been executed, unless the active plan records a blocker with explicit `Human input needed: ...`.

## Plan Lifecycle Protocol
1. Start work by creating/updating one `active/` plan with `status: active`.
2. Keep steps, risks, and verification evidence current as work progresses.
3. Before completion, confirm Definition of Done and capture final verification evidence.
4. Finalize by setting frontmatter to `status: completed`, adding `completed: <YYYY-MM-DD>`, then moving the file to `completed/`.
5. Run `make pr-ready`, then immediately run `make pr-submit`.
6. If a blocker remains, keep the plan in `active/` and add a blocker exception note with `Human input needed: <exact question>`.

## Taskflow Gate Rules
- `make taskflow` runs automatically inside `make check` for code changes.
- Code changes must touch exactly one plan file under `docs/exec-plans/active/` or `docs/exec-plans/completed/`.
- Touched plans must include `## Workflow`, `## Iteration Log`, and loop evidence with `make check` + `review`.
- Touched plans must not include unresolved `<fill-...>` placeholders.
- Touched plans must include a `## PR` section with `- PR: ...`.
- A plan in `completed/` must include frontmatter `status: completed` and `completed: <YYYY-MM-DD>`.

## Environment Blocker Exception Format
Use this format when a check fails due to environment constraints and not product behavior:

```md
## Blockers
- Command: `<command>`
- Date: `<YYYY-MM-DD>`
- Environment: `<local/sandbox/CI + relevant constraint>`
- Failure Summary: `<short reason>`
- Evidence: `<key error line(s)>`
- Human input needed: `<exact question for a human>`
- Owner Action: `<what must happen next and who owns it>`
- Task Status Impact: `<why plan remains active or why completion is still valid>`
```

Use this template for new active plans:

```md
---
owner: agent
status: active
created: <YYYY-MM-DD>
---

# Plan: <task_name>

## Context
Links:
- Spec: docs/product-specs/<spec>.md
- Architecture: ARCHITECTURE.md
- Runbook: docs/runbooks/<name>.md

## Workflow
- Init Command: `make init-feature FEATURE=<task-slug>`
- Worktree: `<fill-worktree-path>`
- Branch: `<fill-branch-name>`
- Active Plan: `docs/exec-plans/active/<yyyy-mm-dd>-<task-slug>.md`
- Status: `<fill-current-phase>`

## Steps
1) <fill-step-1>
2) <fill-step-2>

## Risks
- <fill-risk-1>

## Iteration Log
- Iteration 1: context gathered; pending first edit -> make check -> review loop.

## Verification
- <fill-verification-command-and-outcome>

## PR
- PR: pending (replace with PR URL after `make pr-submit`, or record blocker context)

## Blockers (optional)
- Use the Environment Blocker Exception Format above when relevant.
```
