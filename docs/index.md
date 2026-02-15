# Documentation Index

This repository is agent-first. `AGENTS.md` is the map; `docs/` is the system of record.

## Read Order
1. `AGENTS.md`
2. `ARCHITECTURE.md`
3. `docs/core-beliefs.md`
4. `docs/product-specs/index.md`
5. `docs/exec-plans/active/`

## Quick Start For A New Task
1. Map the task to one or more specs in `docs/product-specs/index.md`.
2. Check existing work in `docs/exec-plans/active/` and `docs/exec-plans/completed/`.
3. If needed, create/update a plan using `docs/exec-plans/README.md`.
4. Implement minimal scoped changes.
5. Run required checks before completion (`make check` is the required completion gate).
6. Refresh docs/quality/debt artifacts touched by the change.
7. Finalize the plan lifecycle per `docs/exec-plans/README.md` (status update + move to `completed/` when done, or blocker note if not done).

## Documentation Areas
- `docs/product-specs/index.md` and `docs/product-specs/README.md`: authoritative behavior and acceptance criteria.
- `docs/exec-plans/README.md`: planning format and lifecycle rules.
- `docs/runbooks/README.md`: operational and debugging procedures.
- `docs/quality/README.md`: quality score and tech-debt tracking.
- `docs/decisions/README.md`: ADR templates and decision log conventions.

## Golden Paths
Canonical autonomous-agent workflows are in `docs/runbooks/golden-paths.md`.

## Document Freshness Loop
Use `docs/runbooks/docs-freshness.md` to keep docs current after changes.
Use `docs/runbooks/quality-review.md` to keep `docs/quality/*` aligned with reality.

## Agent Harness
- `AGENTS.md` defines the high-level workflow.
- `Makefile` defines `make check` as canonical validation.
- `tools/agent/*` implements doc, architecture, and taskflow lifecycle lint.
- `tools/agent/run_with_cleanup.sh` runs deterministic pre/post cleanup for `make` targets and removes `.tmp-*` harness artifacts plus UI test output directories.
- CI runs `make check` on push and pull request.
- `dev/observability-compose.yml` and `dev/obs.sh` provide opt-in observability scaffolding.
