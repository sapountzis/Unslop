# AGENTS.md – Backend (Bun + Hono API)

You are working in the **backend** service.

Minimal responsibilities:

- Auth: email magic-link + JWT sessions.
- Classification: return **keep/dim/hide** for a LinkedIn post.
- LLM calls: call a single configured model via an inference provider (e.g. OpenRouter).
- Persistence: store post decision + minimal metadata in Postgres.
- Feedback: store user feedback on rendered decisions.
- Billing: Polar checkout + webhook updates.
- Usage quotas: enforce monthly teacher-call caps by plan.

Refer to:
- `../spec/api.md`
- `../spec/data_model.md`
- `../spec/billing.md`
- `../spec/ml.md`

## Setup & dev commands

From `backend/`:

- `bun install`
- `bun run dev`
- `bun test` (if tests exist)

## Boundaries

- Do **not** add:
  - student models
  - heuristic classifiers
  - author-level heuristics
  - offline training scripts
  - dashboards

Classification should be “dumb”:
- Cache by `post_id` (with a simple TTL) to reduce duplicate LLM calls.
- Otherwise call the LLM and persist the decision.
