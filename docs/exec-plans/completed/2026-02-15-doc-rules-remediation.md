---
owner: agent
status: completed
created: 2026-02-15
completed: 2026-02-15
---

# Plan: Documentation Rules Remediation

## Context
Links:
- Spec: docs/product-specs/spec.md
- Spec: docs/product-specs/infra.md
- Architecture: ARCHITECTURE.md
- Runbook: docs/runbooks/golden-paths.md
- Runbook: docs/runbooks/docs-freshness.md
- Runbook: docs/runbooks/quality-review.md

Goal:
- Align repository docs and harness behavior with the latest documentation rules.

Scope:
- Root harness prerequisites and setup behavior.
- Product specs template conformance.
- Execution plan template conformance.
- Runbook contract conformance.
- Legacy spec-path reference cleanup.

## Steps
1) Make setup/check robust when root tooling prerequisites are missing.
2) Fix Biome usage for current CLI semantics and keep harness ownership at root.
3) Refactor `docs/product-specs/*.md` to required section schema.
4) Refactor active/completed execution plans to template-aligned structure.
5) Refactor runbooks to include preconditions, steps, expected results, and recovery paths.
6) Remove remaining legacy spec-path references from non-historical docs.
7) Run `make check` and record results.
8) Add explicit Definition of Done and plan/task completion protocol to agent workflow docs.

## Risks
- Large documentation edits can accidentally change product meaning instead of structure.
- Build/gate tooling can fail due environment/network assumptions.

## Verification
- `make setup`
- `make check`
- `rg -n "docs/product-specs/" docs extension/docs -S`

## Verification Evidence
- `make setup` passes with root tooling bootstrap + subproject installs.
- `make fmtcheck` passes after adding Biome config (`biome.json`) for Tailwind directives and generated-output exclusions.
- `make lint` passes with source lint errors fixed (`extension/src/background/index.ts`, `frontend/src/components/ToggleDemo.jsx`).
- `make type` passes.
- `make test` passes after making preclassify CSS selector tests resilient to formatter-driven line wrapping.
- `make doclint` passes (`0 error(s), 0 warning(s)`).
- `make archlint` passes (`0 violation(s)`).
- `make check` passes end-to-end.
- UI check gate reports remediation/protocol output through `tools/agent/ui_check.sh` and is invokable directly via `make ui`.
- Temporary execution directories are ephemeral: `.tmp-check.*`, `.tmp-setup.*`, and `.tmp-check-ui.*` are removed on exit, and UI artifact dirs (`test-results`, `playwright-report`) are cleaned by `tools/agent/ui_check.sh`.
- Added explicit completion criteria and plan/task lifecycle protocol to agent docs:
  - `AGENTS.md` (Definition of Done + lifecycle).
  - `docs/exec-plans/README.md` (Definition of Done, completion protocol, blocker exception format).
  - `docs/runbooks/golden-paths.md` and `docs/index.md` (workflow references updated to match).
- Updated completion criteria wording so `make check` is the single blocking gate and includes the UI check gate.
- `make check` passes after the workflow-rule updates (`fmtcheck`, `lint`, `type`, `test`, `doclint`, `archlint` all pass).
- UI gate is now a first-class command (`make ui`) and is enforced as a blocking step inside `make check`.
- `tools/agent/ui_check.sh` now auto-starts the frontend on a per-run local port, waits for readiness, and cleans up the spawned server and temp artifacts on exit.
- `tools/agent/check.sh` now suppresses successful gate logs and prints diagnostics only when a gate fails, reducing `make check` output noise.
- `tools/agent/ui_check.sh` now uses a per-run UI port and passes `UI_CHECK_BASE_URL` to Playwright, preventing concurrent `make` runs from racing on `4321`.
- `make check` passes with blocking UI gate and concise output (`running` lines + final pass, failure logs only on gate errors).
