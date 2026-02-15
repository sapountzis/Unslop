---
owner: agent
status: completed
created: 2026-02-15
completed: 2026-02-15
---

# Plan: taskflow_ignore_transient_artifacts

## Context
Links:
- Spec: docs/product-specs/infra.md
- Architecture: ARCHITECTURE.md
- Runbook: docs/runbooks/golden-paths.md

## Steps
1) Completed: reproduced false-positive `taskflow` failures where `make check` temp artifacts were interpreted as code changes.
2) Completed: updated `tools/agent/taskflow_check.ts` to ignore known transient artifact paths (`.tmp-check*`, `.tmp-check-ui*`, `.tmp-setup*`, `test-results`, `playwright-report`).
3) Completed: added tracked placeholder `docs/exec-plans/active/.gitkeep` so CI checkout preserves the required active plan directory for doclint.
4) Completed: reran check gates and pushed branch updates.

## Risks
- If new transient artifact locations are introduced, they must be added to taskflow ignore patterns.
- Overbroad ignore patterns could hide real changes if paths overlap with source-owned files.

## Verification
- `make doclint`
- `make check`
