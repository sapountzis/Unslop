# AGENTS.md – Unslop (Root)

This repo contains **Unslop**, a Chrome extension + backend API that filters the LinkedIn feed by **dimming or hiding posts based on a backend decision**.

## Project layout

- `backend/` – Bun + Hono API, Postgres via Neon, Drizzle ORM.
- `extension/` – Chrome extension (Manifest V3): content script + background + popup.
- `frontend/` – Static site for `getunslop.com` (landing + privacy/support pages).
- `spec/` – Source-of-truth specs.

Start here: `spec/spec.md`.

## Global rules

- Keep the implementation **minimal**:
  - No model training.
  - No “student model”.
  - No heuristic classifier.
  - No per-author rules or author-level tuning.
  - No dashboards or analytics UI.

- The system should do only:
  1) Extension extracts a post and asks the API for a decision.
  2) API calls an LLM (via an inference provider) when needed.
  3) API stores the decision + minimal metadata in Postgres.
  4) Extension applies the decision (dim/hide/keep) and can send feedback.
  5) Auth + subscription billing + usage quotas.
  6) A minimal public site that hosts install links + privacy + support.

## Safety

- Never log or store secrets (JWTs, API keys).
- Avoid logging full post text at high volume in production logs (DB storage is per spec; logs must remain minimal).
- Billing changes must update `spec/billing.md` and `spec/api.md`.
