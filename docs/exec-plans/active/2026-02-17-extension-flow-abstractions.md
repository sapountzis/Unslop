---
owner: agent
status: active
created: 2026-02-17
---

# Plan: extension_flow_abstractions

## Context
Links:
- Spec: docs/product-specs/extension.md
- Spec: docs/product-specs/spec.md
- Architecture: ARCHITECTURE.md
- Runbook: docs/runbooks/golden-paths.md

## Workflow
- Init Command: `make init-feature FEATURE=extension-flow-abstractions`
- Worktree: `/tmp/unslop-worktrees/extension-flow-abstractions`
- Branch: `feat/extension-flow-abstractions`
- Active Plan: `docs/exec-plans/active/2026-02-17-extension-flow-abstractions.md`
- Status: implementation in progress
- Autonomy: Continue through `make pr-ready` then `make pr-submit` unless blocked or human input is required.

## Steps
1) Audit and simplify extension flow boundaries by extracting clear module responsibilities:
   - `BatchDispatcher` service for content classify queue state (remove module-global queue state)
   - background message router split from monolithic switch
   - popup diagnostics runner abstraction
2) Keep behavior stable while reducing coupling:
   - preserve classify + fail-open + diagnostics contracts
   - add/update tests for refactored boundaries and regression-sensitive flows
3) Improve docs for onboarding/debugging:
   - rewrite architecture references with current file paths
   - split flow diagrams into clearer content/background paths
   - add explicit onboarding + debug guides with symptom-to-owner mapping
4) Validate and ship through golden path:
   - run targeted tests then `make check`
   - complete plan lifecycle and run `make pr-ready`, `make pr-submit`

## Risks
- Refactoring message/queue boundaries can change classify timing or drop pending results if lifecycle transitions are incorrect.
- Docs updates can drift from runtime quickly unless they are tied to exact module names and message contracts.

## Iteration Log
- Iteration 1: initialized feature worktree, selected governing specs, and captured refactor + docs scope.
- Iteration 2: implemented content/background/popup abstractions and added regression tests; ran `bun test extension/src/background extension/src/content extension/src/popup`; review: fixed workflow-level issues before gate run.
- Iteration 3: ran `make check`; review: workflow validator required explicit edit/check/review loop wording in this plan and was remediated.

## Verification
- `bun test extension/src/content/*.test.ts extension/src/background/*.test.ts extension/src/popup/*.test.ts` (expected pass after refactor updates)
- `make check` (must pass)
- `make pr-ready` then `make pr-submit` (must pass, with PR URL recorded)

## PR
- PR: pending (replace with PR URL after `make pr-submit`, or record blocker context)

## Blockers (optional)
- Use docs/exec-plans/README.md blocker exception format when blocked.
