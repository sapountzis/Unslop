# Quality Score

Last reviewed: 2026-02-15

Track quality by domain/layer from 0 (poor) to 5 (strong).

## Scoring Rubric
- 0: broken or unowned.
- 1: frequent failures, missing tests, unclear ownership.
- 2: basic behavior exists, reliability gaps are common.
- 3: acceptable baseline with known improvement backlog.
- 4: reliable and well-tested with rare regressions.
- 5: strong reliability, clear ownership, and continuous validation.

## Product Domains
| Domain | Score | Owner | Evidence |
| --- | --- | --- | --- |
| backend/auth | 3 | backend | baseline harness + auth tests |
| backend/classification | 3 | backend | baseline harness + service tests |
| backend/billing-quota | 3 | backend | baseline harness + billing paths |
| extension/runtime | 3 | extension | extension tests + smoke checks |
| extension/platform-plugins | 3 | extension | plugin compliance + parser tests |
| frontend/site | 3 | frontend | site build + UI smoke checks |

## Architecture Layers
| Layer | Score | Owner | Evidence |
| --- | --- | --- | --- |
| types | 3 | shared | type checks |
| config | 3 | shared | config usage checks |
| repository | 3 | backend | repository tests |
| service | 3 | backend | service tests |
| runtime | 3 | backend/extension | runtime route checks |
| ui | 3 | extension/frontend | UI smoke + platform behavior |

## Score Change Rules
- Update scores only with concrete evidence.
- Document why each changed score moved.
- Map lowest scores to at least one item in `docs/quality/tech-debt.md`.
