# Technical Debt

Last reviewed: 2026-02-15

Track debt as explicit, owned, reviewable tasks.

## Rules
- Every item must include domain, owner, priority, status, and verification.
- Keep this list short and high signal.
- Do not add duplicate entries for the same underlying issue; update the existing item.
- Update this file via `docs/runbooks/quality-review.md`.

## Open Items
| ID | Item | Domain | Owner | Priority | Status | Verification |
| --- | --- | --- | --- | --- | --- | --- |
| TD-001 | Replace duplicated classification payload shaping with a shared helper. | backend/classification | backend | med | open | backend tests for classification paths |
| TD-002 | Add runbook for cross-platform parser regressions (in `docs/runbooks/`; extension debugging lives in `extension/AGENTS.md`). | extension/platform-plugins | extension | med | open | parser + plugin compliance tests |
| TD-003 | Add frontend performance budget checks to CI. | frontend/site | frontend | low | open | CI gate for frontend perf budget |

## Template
| ID | Item | Domain | Owner | Priority | Status | Verification |
| --- | --- | --- | --- | --- | --- | --- |
| TD-XXX | <work item> | <quality-domain> | <team_or_person> | low\|med\|high | open\|in-progress\|blocked | <test/command/evidence> |
