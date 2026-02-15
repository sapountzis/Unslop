---
owner: agent
status: completed
created: 2026-02-15
completed: 2026-02-15
---

# Plan: tmp_artifact_cleanup_and_taskflow_enforcement

## Context
Links:
- Spec: docs/product-specs/infra.md
- Architecture: ARCHITECTURE.md
- Runbook: docs/runbooks/golden-paths.md

## Steps
1) Completed: reproduced leftover temp-artifact behavior and confirmed stale `.tmp-check.*` visibility.
2) Completed: implemented deterministic pre/post cleanup for every `make` target via `tools/agent/run_with_cleanup.sh` and `tools/agent/cleanup_tmp_artifacts.sh`.
3) Completed: refreshed harness docs in `docs/index.md`.
4) Completed: added deterministic `taskflow` check gate (`tools/agent/taskflow_check.ts`) and wired it through `tools/agent/taskflow.sh`, `tools/agent/check.sh`, and `Makefile`.
5) Completed: ran full `make check` and captured gate outcomes.
6) Completed: finalized plan lifecycle in `docs/exec-plans/completed/`.

## Risks
- Cleanup scope could accidentally delete non-harness files if artifact patterns are too broad.
- Wrapper-level command execution could mask underlying command exit status if status forwarding regresses.

## Verification
- `make fmtcheck lint doclint archlint` (pass)
- `make type` (pass)
- `make test` (pass)
- `make ui` (pass with escalated permissions outside sandbox)
- `make check` (pass with escalated permissions outside sandbox; includes `fmtcheck`, `lint`, `type`, `test`, `ui`, `doclint`, `archlint`, and `taskflow`)
- Manual deterministic cleanup check:
  - created `.tmp-check.fake`, `.tmp-check-ui.fake`, `.tmp-setup.fake`, `test-results`, `playwright-report`
  - ran `make fmtcheck`
  - confirmed all temporary artifacts were removed before/after command execution
- `make taskflow` (expected fail while plan remained in `active/` without blocker question; validates deterministic failure path)
