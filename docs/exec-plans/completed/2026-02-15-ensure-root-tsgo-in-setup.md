---
owner: agent
status: completed
created: 2026-02-15
completed: 2026-02-15
---

# Plan: ensure_root_tsgo_in_setup

## Context
Links:
- Spec: docs/product-specs/agent-workflow.md
- Architecture: ARCHITECTURE.md
- Runbook: docs/runbooks/golden-paths.md

## Workflow
- Init Command: `make init-feature FEATURE=ensure-root-tsgo-in-setup`
- Worktree: `/tmp/unslop-worktrees/ensure-root-tsgo-in-setup`
- Branch: `feat/ensure-root-tsgo-in-setup`
- Active Plan: `docs/exec-plans/active/2026-02-15-ensure-root-tsgo-in-setup.md`
- Status: completed
- Autonomy: Continue through `make pr-ready` then `make pr-submit` unless blocked or human input is required.

## Steps
1) Confirm root setup already guarantees `@typescript/native-preview` in the generated `package.json` before install, and avoid unnecessary setup complexity changes.
2) Fix PR cleanup automation to perform verified linked-worktree and branch cleanup without silent partial leftovers.
3) Align tsgo dependency selection to use `@typescript/native-preview: latest` across root/backend/extension setup manifests.
4) Audit top-level docs to remove duplicated workflow details and replace with pointers to canonical runbooks/spec docs.
5) Verify behavior and run `make check`, then finalize docs/plan lifecycle.

## Risks
- Mutating an existing root `package.json` could reorder formatting or fields unexpectedly if update logic is not deterministic.
- Cleanup sequencing after PR creation must avoid false-success messaging when worktree removal fails.
- Tracking `latest` for `@typescript/native-preview` can change behavior between setup runs and requires lockfile verification.

## Iteration Log
- Iteration 1: mapped governing spec and filled plan template.
- Iteration 2: edit (`tools/agent/post_pr_cleanup.sh`) -> make check (failed on workflow evidence gate) -> review (identified missing explicit loop evidence text in plan).
- Iteration 3: edit (plan workflow evidence update) -> make check (pass) -> review (validated workflow/taskflow gates and cleanup behavior changes).
- Iteration 4: edit (`package.json`, `backend/package.json`, `extension/package.json`, `dev/setup.sh`) -> make check (pending) -> review (confirmed intent to track `@typescript/native-preview` as `latest`).
- Iteration 5: edit (`README.md`, `docs/index.md`, `AGENTS.md`) -> make check (failed at taskflow due missing touched plan file) -> review (added plan update requirement).
- Iteration 6: edit (plan evidence update) -> make check (pass) -> review (confirmed taskflow compliance with touched plan evidence).
- Iteration 7: edit (`tools/agent/check.sh`, `tools/agent/workflow.sh`, `tools/agent/taskflow.sh`, `tools/agent/doclint.sh`, `tools/agent/archlint.sh`, `AGENTS.md`) -> make check (pending rerun) -> review (kept `check.sh` thin; moved actionable guidance to gate-specific checks).
- Iteration 8: edit (`README.md`, `docs/index.md`, `docs/product-specs/agent-workflow.md`, plan evidence) -> make check (pass) -> review (verified top-level docs are pointer-first and workflow spec captures failure-diagnostic requirements).
- Iteration 9: edit (`tools/agent/doc_lint.ts`, `tools/agent/typecheck.sh`, `tools/agent/test.sh`) -> make check (pass) -> review (doclint now groups per-rule violations; type/test now aggregate per-component failures with specific remediation).
- Iteration 10: edit (`tools/agent/run_with_cleanup.sh`) -> make check (pending rerun) -> review (prevented false failure when `pr-submit` removes active worktree before wrapper post-cleanup).
- Iteration 11: edit (`tools/agent/test.sh`, `tools/agent/typecheck.sh`) -> make check (pending rerun) -> review (added per-component log tails so failures cannot be hidden by long later-suite output).
- Iteration 12: edit (env parity for manual fix worktree: copied `backend/.env`) -> make check (pass) -> review (confirmed backend test failures were environment-related and diagnostics now identify failing suite details directly).
- Iteration 13: edit (`tools/agent/taskflow_check.ts`) -> make check (pending rerun) -> review (made taskflow failure diagnostics adaptive with mutation counts, categorized file lists, and condition-specific remediation).

## Verification
- `bash ./tools/agent/typecheck.sh` (pass; final line reports `engine: tsgo`)
- `make check` (pass)
- `make check` (fail; taskflow required one touched execution plan file when code files changed)
- `make check` (pass; after plan evidence update and docs pruning)
- `make check` (pass; after spec + gate-diagnostic updates)
- `make check` (pass; after multi-use-case diagnostics audit across doclint/type/test)
- `make pr-submit` (partial success: PR created and cleanup completed, but command exited non-zero because wrapper post-cleanup referenced removed worktree)
- `make check` (fail in manual fix worktree: workflow marker/setup missing; resolved by restoring marker and running make setup)
- `make test` (pass after env bootstrap parity via `backend/.env`)
- `make check` (pass after run_with_cleanup + diagnostics refinements)
- `make taskflow` (pass after adaptive diagnostics update + plan touch)

## PR
- PR: https://github.com/sapountzis/Unslop/pull/8

## Blockers (optional)
- Use docs/exec-plans/README.md blocker exception format when blocked.
