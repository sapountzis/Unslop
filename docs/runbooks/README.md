# Runbooks

Runbooks capture operational/debugging procedures in a form agents can execute.

## Runbook Contract
Each runbook should include:
- Preconditions.
- Step-by-step commands/actions.
- Expected results.
- Recovery path if checks fail.
- Owner and update trigger when applicable.

## Runbook Index
- `docs/runbooks/golden-paths.md`: canonical task flows for autonomous agents.
- `docs/runbooks/docs-freshness.md`: process for keeping docs current after changes.
- `docs/runbooks/quality-review.md`: manual quality score and tech-debt maintenance loop.
- `docs/runbooks/observability.md`: local observability stack setup/use.
- `docs/runbooks/ui-debugging.md`: frontend/UI smoke and failure triage.

**Extension**: Architecture, flows, diagnostics, and module roles are in `extension/AGENTS.md` (no `extension/docs/`).
