# CODEX.md - Repo Instructions for Coding Agents

## Start
1) Read `AGENTS.md`
2) Read `docs/index.md`
3) Read relevant specs in `docs/product-specs/`
4) Read active plans in `docs/exec-plans/active/`
5) Use `docs/runbooks/golden-paths.md` for workflow defaults
6) Apply `docs/runbooks/docs-freshness.md` before completion

## Required Workflow
1) If no execution plan exists, create one in `docs/exec-plans/active/`.
2) Make minimal, focused code changes.
3) Run `make check` before proposing completion.
4) Update docs/specs/decisions if behavior changed.
5) Keep quality/debt docs aligned with evidence when posture changes.

## Guardrails
- Follow repo constitutions, including `backend/AGENTS.md` and `extension/AGENTS.md`.
- Keep diffs small and legible for future agents.
- Do not ship stale docs.
- Never guess dependency versions from memory; verify from repository manifests/lockfiles or prompt requirements.
