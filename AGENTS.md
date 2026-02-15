# AGENTS.md - Map for Coding Agents

## Prime Directive
- Implement changes that satisfy acceptance criteria in `docs/product-specs/*`.
- Initialize every feature task with `make init-feature FEATURE=<task-slug>` before editing code.
- Progress autonomously through PR creation with `make pr-ready` then `make pr-submit`, unless blocked or explicit human input is required.
- If knowledge is missing, update docs under `docs/*` so future agents can discover it.

## Start Here
1) `docs/index.md`
2) `ARCHITECTURE.md`
3) `docs/core-beliefs.md`

## Task-to-Spec Mapping
- Map every task to at least one spec from `docs/product-specs/index.md`.
- If no spec fits, create/update the spec first.
- Refresh stale or unclear specs (`last_verified`) in the same change.
- Detailed mapping/freshness rules: `docs/product-specs/index.md`, `docs/runbooks/docs-freshness.md`.

## Commands
- `make setup`   # install dependencies and local tooling
- `make init-feature FEATURE=<task-slug>` # start a new feature task workspace
- `make fmt`     # apply formatting fixes
- `make check`   # canonical non-mutating quality gate
- `make ui`      # UI gate only
- `make test`    # tests only
- `make workflow` # workflow-compliance gate
- `make taskflow` # plan-lifecycle gate
- `make pr-ready` # required PR readiness gate before submission
- `make pr-submit` # submit command: push + PR create/reuse + verified local cleanup
- `make pr-cleanup` # manual local linked-worktree cleanup helper

## Golden Path (Default)
- Canonical flow + variants: `docs/runbooks/golden-paths.md`.
- Plan lifecycle, completion protocol, and blocker format: `docs/exec-plans/README.md`.

## Completion Criteria (Definition of Done)
- Source of truth: `docs/exec-plans/README.md#definition-of-done`.
- Enforce via `make check`, `make pr-ready`, and `make pr-submit`.

## Plan/Task Lifecycle
- Follow `docs/exec-plans/README.md` for lifecycle details and blocker exception format.
- Keep exactly one active plan and keep evidence current throughout execution.

## Keeping Docs Fresh
- Follow `docs/runbooks/docs-freshness.md` on every meaningful change.
- Run `docs/runbooks/quality-review.md` weekly during active development and after medium/large changes.
- Keep `docs/quality/QUALITY_SCORE.md` and `docs/quality/tech-debt.md` aligned with real evidence.

## Escalate To Humans When
- Product specs are ambiguous or missing.
- Security, privacy, compliance, or billing policy changes are involved.
- A decision has broad cross-domain impact.

## Repository-Specific Boundaries
- This repo implements a minimal Chrome extension + backend + site.
- Do not add model training, student models, heuristic classifiers, per-author tuning, or analytics dashboards.
- Backend constitution is binding for backend changes: `backend/AGENTS.md`.
- Extension constitution is binding for extension changes: `extension/AGENTS.md`.
- Never guess dependency versions from memory; verify using repository manifests/lockfiles or explicit prompt instructions.

## Documentation Rule
`AGENTS.md` is the table of contents, not the encyclopedia.
Authoritative details belong in `docs/` and are mechanically checked by lint + CI.
