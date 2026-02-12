# AGENTS.md – Spec

This directory is the **source of truth** for Unslop’s delivered scope.

Your job:

- Keep specs consistent with each other (API, DB, extension, billing, frontend).
- Remove “future work” and “nice-to-haves”.
- If code changes behavior, update the spec at the same time.

Style:
- Use direct, testable language.
- Define what must exist in v0.1 and what is explicitly out of scope.

Files:
- `spec.md` – scope + deliverables
- `infra.md` – deployment + env vars + domains
- `api.md` – HTTP contract
- `data_model.md` – Postgres schema
- `extension.md` – extension behavior
- `billing.md` – plans + quotas + Polar integration
- `ml.md` – LLM prompt + parsing contract (LLM-only; no training)
- `frontend.md` – public site scope (landing + privacy/support)
