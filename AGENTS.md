# AGENTS.md - Map for Coding Agents

## Prime Directive
- Implement changes that satisfy acceptance criteria in `docs/product-specs/*`.
- Initialize every feature task with `make init-feature FEATURE=<task-slug>` before editing code.
- Always run `make check` before opening a PR.
- If knowledge is missing, update docs under `docs/*` so future agents can discover it.

## Start Here
1) `docs/index.md`
2) `ARCHITECTURE.md`
3) `docs/core-beliefs.md`
4) `docs/product-specs/index.md`
5) `docs/exec-plans/active/`

## Task-to-Spec Mapping
- Start from `docs/product-specs/index.md` and map the incoming task to at least one spec.
- If no spec applies, create or update a spec in `docs/product-specs/` before implementation.
- Use `last_verified` as a freshness signal. If stale or unclear, refresh the spec in the same change.

## Commands
- `make setup`   # install dependencies and local tooling
- `make init-feature FEATURE=<task-slug>` # create linked worktree + branch + active plan template
- `make fmt`     # apply formatting fixes
- `make check`   # non-mutating gate: workflow + fmtcheck + lint + type + test + ui + doclint + archlint + taskflow
- `make ui`      # UI gate only
- `make test`    # tests only
- `make workflow` # linked-worktree + branch + plan workflow gate
- `make taskflow` # execution-plan lifecycle + loop evidence gate
- `make pr-ready` # PR readiness gate (clean tree + completed plan + full check)
- `make pr-submit` # create PR through `gh` after readiness validation

## Golden Path (Default)
1) Run `make init-feature FEATURE=<task-slug>` from the primary checkout.
2) Fill the generated active plan template before any code edits.
3) Choose the governing spec from `docs/product-specs/index.md`.
4) Read related architecture and runbooks from `ARCHITECTURE.md` and `docs/runbooks/`.
5) Implement minimal scoped changes.
6) Execute `(edit -> make check -> review notes)` loops until clean.
7) Update specs/runbooks/quality docs before marking complete.
8) Finalize plan lifecycle, then run `make pr-ready` and `make pr-submit`.

Canonical variants live in `docs/runbooks/golden-paths.md`.

## Workflow
1) Start with `make init-feature FEATURE=<task-slug>` to create a linked worktree and seeded active plan.
2) Fill task details in the generated plan file before implementation.
3) Read relevant product specs in `docs/product-specs/`.
4) Implement changes in small commits.
5) Run `make check` and capture review evidence in the plan after each loop.
6) Update docs/specs/decisions when behavior changes.
7) Finalize the plan lifecycle, then open a focused PR with links to spec and plan.

## Completion Criteria (Definition of Done)
- Task completion requires all of the following:
  - Governing specs/runbooks/docs are updated for the delivered behavior.
  - Verification evidence in the task plan is current and command-specific.
  - `make check` passes from repository root.

## Plan/Task Lifecycle
1) Start: create or update one plan in `docs/exec-plans/active/` with `status: active`.
2) During execution: keep steps, risks, and verification evidence current after each material change.
3) Finalize:
   - confirm completion criteria are satisfied;
   - set plan frontmatter to `status: completed` and add `completed: <YYYY-MM-DD>`;
   - move the plan file to `docs/exec-plans/completed/`.
4) If blocked: keep the plan in `active/`, capture the blocker + owner action in the standard exception format, and do not mark completed.

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
