# Documentation Index

This repository is agent-first. `AGENTS.md` is the map; `docs/` is the system of record.

## Read Order
1. `AGENTS.md`
2. `ARCHITECTURE.md`
3. `docs/core-beliefs.md`
4. `docs/product-specs/index.md`
5. `docs/exec-plans/active/`

## Quick Start For A New Task
1. Run `make init-feature FEATURE=<task-slug>` from the primary checkout.
2. Fill the generated active plan template before any code edits.
3. Use file pointers for full procedure details:
   - `docs/runbooks/golden-paths.md` for workflow steps and variants.
   - `docs/exec-plans/README.md` for lifecycle/DoD/blocker rules.
   - `docs/product-specs/index.md` for governing-spec selection.

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
- `Makefile` defines canonical validation and workflow/PR commands.
- Use `make` targets as the interface; follow command output and remediation text to iterate toward green gates.
- Harness commands are expected to provide actionable failure diagnostics and clear retry protocol.
- CI runs `make check` on push and pull request.
- `dev/observability-compose.yml` and `dev/obs.sh` provide opt-in observability scaffolding.
