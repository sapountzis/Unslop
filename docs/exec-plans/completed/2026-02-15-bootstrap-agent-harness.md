---
owner: agent
status: completed
created: 2026-02-15
completed: 2026-02-15
---

# Plan: Bootstrap Agent-First Harness

## Context
Links:
- Spec: docs/product-specs/spec.md
- Spec: docs/product-specs/infra.md
- Architecture: ARCHITECTURE.md
- Runbook: docs/runbooks/golden-paths.md
- Runbook: docs/runbooks/docs-freshness.md

- Goal: Reshape this existing repository into an agent-first, self-managing codebase.
- Primary effort: migrate and normalize documentation structure.
- Existing stack: Bun monorepo (backend, extension, frontend).

## Steps
1) Restructure docs into canonical hierarchy under docs/.
2) Move spec content into docs/product-specs/, update references, and delete legacy spec paths.
3) Rewrite AGENTS.md and per-agent adapters as concise maps.
4) Add ARCHITECTURE.md with enforceable layering rules.
5) Add harness scripts (format/lint/type/test/check/doc_lint/arch_lint) and Makefile.
6) Add CI harness and explicit manual quality/tech-debt review instructions.
7) Add observability/UI runbook stubs and eval scaffolding.
8) Add explicit golden paths and a documentation freshness loop for autonomous agents.
9) Run make check and fix failures.

## Risks
- Migration sequencing risk: partially moved docs could leave broken links and stale references.
- Gate reliability risk: harness could pass locally but fail in CI if tooling assumptions were implicit.

## Verification
- `make check` passes and does not mutate files.
- `docs/index.md` is a usable navigation entrypoint.
- agent files point to docs/ as system of record.
- `docs/runbooks/golden-paths.md` defines canonical task flows.
- `docs/runbooks/docs-freshness.md` defines documentation maintenance loop.

## Migration Evidence

### Commands Executed
- `git rev-parse --is-inside-work-tree`
- `git status --short`
- `chmod +x dev/setup.sh dev/obs.sh tools/agent/*.sh`
- `make setup`
- `make check` (attempted for baseline; full green verification deferred by user request)
- `rg` sweep over markdown to confirm no legacy spec-root or legacy plan-root path references remain

### Final Check Status
- Full green `make check` verification was intentionally deferred in this migration pass per user direction to focus on structure migration.

### Files Created/Migrated
- Core entrypoints: `AGENTS.md`, `ARCHITECTURE.md`, `CLAUDE.md`, `agents/CLAUDE.md`, `agents/codex.md`.
- Docs navigation/core: `docs/index.md`, `docs/core-beliefs.md`.
- Product specs migrated to `docs/product-specs/`: `spec.md`, `api.md`, `billing.md`, `data_model.md`, `extension.md`, `frontend.md`, `infra.md`, `ml.md`.
- Execution plans moved to `docs/exec-plans/` with active/completed structure.
- Quality/runbooks: `docs/quality/QUALITY_SCORE.md`, `docs/quality/tech-debt.md`, `docs/runbooks/*.md`, `docs/decisions/README.md`.
- Harness/tooling: `tools/agent/*`, `Makefile`, `dev/*`, `.github/workflows/ci.yml`, `playwright.config.ts`, `ui-tests/smoke.spec.ts`, `evals/*`.

### Broken Links/Paths Fixed
- Rewrote constitution links from legacy spec paths to `docs/product-specs/*` in:
  - `AGENTS.md`
  - `backend/AGENTS.md`
  - `extension/AGENTS.md`
  - `README.md`
- Rewrote legacy plan-root references to `docs/exec-plans/*`.
- Updated migrated completed plan references to `docs/product-specs/...`.

### Autonomous-Agent Hardening Pass
- Added explicit golden-path workflows: `docs/runbooks/golden-paths.md`.
- Added documentation freshness operating loop: `docs/runbooks/docs-freshness.md`.
- Added quality index and stronger score/debt structure: `docs/quality/README.md`, updated `docs/quality/*.md`.
- Updated agent/doc entrypoints to route into the golden path and freshness loop:
  - `AGENTS.md`
  - `docs/index.md`
  - `docs/runbooks/README.md`
  - `agents/codex.md`
  - `agents/CLAUDE.md`
  - `README.md`
