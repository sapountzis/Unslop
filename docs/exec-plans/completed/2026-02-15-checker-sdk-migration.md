---
owner: agent
status: completed
created: 2026-02-15
completed: 2026-02-15
---

# Plan: checker_sdk_migration

## Context
Links:
- Spec: docs/product-specs/agent-workflow.md
- Architecture: ARCHITECTURE.md
- Runbook: docs/runbooks/golden-paths.md

## Workflow
- Init Command: `make init-feature FEATURE=checker-sdk-migration`
- Worktree: `/tmp/unslop-worktrees/checker-sdk-migration`
- Branch: `feat/checker-sdk-migration`
- Active Plan: `docs/exec-plans/active/2026-02-15-checker-sdk-migration.md`
- Status: completed
- Autonomy: Full PR automation resumed by human instruction.

## Steps
1) Completed: implemented typed checker interface, centralized runner/registry, shared utilities, and routed `make` targets through `tools/checks/cli.ts`.
2) Completed: migrated legacy checker/PR scripts to checker modules and command modules, added parity tests, removed legacy scripts, and validated with full local checks.
3) Completed: audited SDK quality, removed checker duplication via shared command abstractions, enforced checker contract invariants/timeouts, centralized registry-driven usage/order resolution, and hardened gate subprocess logging behavior.
4) Completed: pruned the SDK to a minimal checker contract (`exec/tail/fail`), flattened runtime/error/registry abstractions, simplified heavy checkers (`type/test/ui`), and switched readability guardrails to a single global checker budget.

## Risks
- Migration drift could change gate behavior or diagnostics; mitigate with explicit parity tests that compare legacy and new outcomes per gate before legacy removal.

## Iteration Log
- Iteration 1: context gathered; pending first edit -> make check -> review loop.
- Iteration 2: edit (`tools/checks/*`, `Makefile`, `package.json`, `dev/setup.sh`) -> make check (fail: new runner failure path swallowed missing log-dir error) -> review (root cause identified: nested cleanup removed `.tmp-check.*` before log write).
- Iteration 3: edit (`tools/checks/core/runtime.ts`, `tools/checks/core/check-runner.ts`) -> make check (fail: UI gate readiness logic exited early) -> review (root cause identified: incorrect subprocess liveness check).
- Iteration 4: edit (`tools/checks/checkers/ui.ts`) -> make check (pass) -> review (verified gate order/output parity and legacy script removal with passing canonical checks).
- Iteration 5: edit (`tools/checks/core/{define-checker.ts,registry.ts,checker-exec.ts,check-runner.ts,runtime.ts}`, `tools/checks/checkers/{shared.ts,fmt.ts,fmtcheck.ts,lint.ts,type.ts,test.ts,ui.ts}`, `tools/checks/tests/*`) -> make check (fail: fmtcheck drift) -> review (expected formatter drift from refactor).
- Iteration 6: edit (format pass via `make fmt`) -> make check (pass) -> review (verified contract enforcement, centralized patterns, and strengthened parity coverage).
- Iteration 7: edit (`tools/checks/core/{errors.ts,runtime.ts,checker-exec.ts,check-runner.ts,registry.ts,types.ts}`, `tools/checks/cli.ts`, `tools/checks/checkers/{shared.ts,fmt.ts,fmtcheck.ts,lint.ts,type.ts,test.ts,ui.ts}`, `tools/checks/commands/{process.ts,workflow-marker.ts,pr-ready.ts,pr-submit.ts,pr-cleanup.ts,setup.ts}`, `tools/checks/validators/{shared.ts,workflow_check.ts,taskflow_check.ts}`, `tools/checks/tests/checker-contract.test.ts`) -> make check (pass) -> review (validated async runtime timeouts, typed errors, centralized command execution, reduced duplication, and parity preservation).
- Iteration 8: edit (`tools/checks/core/{types.ts,errors.ts,runtime.ts,registry.ts,checker-exec.ts,check-runner.ts,define-checker.ts}`, `tools/checks/checkers/{shared.ts,fmt.ts,fmtcheck.ts,lint.ts,doclint.ts,archlint.ts,workflow.ts,taskflow.ts,type.ts,test.ts,ui.ts}`, `tools/checks/commands/{process.ts,workflow-marker.ts}`, `tools/checks/cli.ts`, `tools/checks/tests/checker-contract.test.ts`) -> make check (fail: readability-budget assertion drift) -> review (root cause: per-file thresholds + newline-count artifact conflicted with global-budget intent).
- Iteration 9: edit (`tools/checks/tests/checker-contract.test.ts`, `tools/checks/checkers/{type.ts,ui.ts}`) -> make check (pass) -> review (confirmed single global 300-line checker budget and end-to-end parity after pruning).
- Iteration 10: edit (`tools/checks/core/{runtime.ts,check-runner.ts,checker-exec.ts}`, `tools/checks/README.md`) -> make check (pass) -> review (removed wrapper noise from failure output, preserved action-oriented diagnostics, and documented internal SDK guardrails).

## Verification
- `bun test tools/checks/tests` (pass)
- `make ui` (pass)
- `make check` (fail: initially at `fmtcheck`; fixed via `make fmt`)
- `make check` (fail: initially at `ui`; fixed readiness/liveness handling in `tools/checks/checkers/ui.ts`)
- `make check` (pass)
- `bun test tools/checks/tests` (pass; includes checker contract + registry/CLI parity assertions)
- `make check` (fail: `fmtcheck` after abstraction refactor; corrected with `make fmt`)
- `make check` (pass)
- `bun test tools/checks/tests` (pass; includes timeout hook + command timeout behavior assertions)
- `make fmt` (pass)
- `timeout 420 make check` (pass)
- `make check` (fail: readability budget assertion while transitioning from per-checker caps to global budget)
- `make fmt` (pass)
- `bun test tools/checks/tests` (pass; includes global checker-budget assertion)
- `timeout 420 make check` (pass)
- `timeout 420 make check` (pass; final rerun after active-plan evidence update)
- `bun test tools/checks/tests` (pass; after message-cleanliness refactor)
- `TYPECHECK_ENGINE=wat make type` (expected fail; verified clean, checker-owned error output)
- `make fmt` (pass)
- `make check` (pass)

## PR
- PR: pending (to be created via `make pr-submit`)
