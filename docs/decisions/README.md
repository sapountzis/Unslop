# Decisions (ADRs)

Record significant architectural and product decisions.

## Filename Format
- `docs/decisions/<YYYY-MM-DD>-<slug>.md`

## When To Write An ADR
- Cross-domain architecture changes.
- Security/privacy/compliance policy changes.
- Billing, quota, or contract changes with product impact.
- Any decision that changes constraints used by future agents.

## Quality Linkage
- If a decision changes quality posture, update:
  - `docs/quality/QUALITY_SCORE.md`
  - `docs/quality/tech-debt.md`
  - `docs/runbooks/quality-review.md` when workflow changes

Template:

```md
# <title>

## Context
...

## Decision
...

## Consequences
- Positive:
- Negative:

## Alternatives Considered
...
```
