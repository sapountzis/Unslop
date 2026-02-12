# Unslop – Minimal Project Spec (v0.1)

Unslop is a Chrome extension + backend API that filters the LinkedIn feed by **hiding posts** according to a backend decision.

v0.1 also includes a minimal public website (`getunslop.com`) for trust + policy/support pages.

## v0.1 goal

Ship the smallest product that:

1) Works on `https://www.linkedin.com/*` and does not break browsing.
2) Calls a backend API for each new post (or uses cached decisions).
3) Applies one of two actions: `keep`, `hide`.
4) Supports email magic-link login (JWT).
5) Supports a subscription (Polar) with Free vs Pro quotas.
6) Stores minimal data for future improvements:
   - `content_fingerprint`, `post_id`, `author_id`, canonical content payload, `decision`, timestamps
   - append-only `classification_events` rows for actual LLM attempts (`status=success|error`, provider error metadata on failures)
   - user feedback rows (in-scope)
7) Hosts a minimal public site with install + privacy + support pages.

## Explicitly out of scope (v0.1)

- Training or fine-tuning any model.
- Any “student model” or heuristic classifier.
- Per-author auto rules (blocklists/allowlists; “author slop rate”).
- Category sliders, multi-dimensional scoring, or thresholds beyond keep/hide.
- Web dashboard, mobile app, analytics UI.

## System components

- **Chrome Extension (MV3)**
  - Content script: detect posts + apply decision.
  - Background service worker: handles auth token + all API calls.
  - Popup UI: enabled toggle, sign-in, plan status, upgrade.

- **Backend API**
  - Bun + Hono TypeScript service.
  - Calls an LLM via an inference provider (OpenRouter).
  - Uses Postgres for caching decisions, user records, feedback, and usage counts.

- **Database**
  - Neon Postgres.
  - Tables: `users`, `classification_cache`, `classification_events`, `post_feedback`, `user_usage`, `user_activity`, `webhook_deliveries`.

- **Billing**
  - Polar checkout + webhooks.
  - Plans: Free and Pro.
  - Quota enforcement based on monthly “teacher LLM calls”.

- **Public website**
  - Static pages hosted at `https://getunslop.com` per `frontend.md`.

## “Teacher call” definition

A **teacher call** is an external LLM request performed by classification endpoints (`/v1/classify` or `/v1/classify/batch`) for a post that is not served from cache.

Cache policy:

- key is deterministic global `content_fingerprint` from canonical payload content
- fresh cache window is fixed at 30 days (non-sliding)
- cache rows are written only after successful LLM outcomes

If the backend returns a cached decision (fresh `content_fingerprint` row in `classification_cache`), it does **not** count towards quota.

Quota is consumed atomically before each non-cached LLM attempt.

`classification_events` rows are written only for actual LLM attempts (cache misses), including error attempts.

## Document map

- `infra.md` – runtime + deploy + env vars + domains
- `api.md` – endpoints + payloads
- `data_model.md` – schema
- `extension.md` – extension behavior
- `billing.md` – plans + quotas + Polar
- `ml.md` – LLM/VLM routing + prompt contract
- `frontend.md` – public site pages + required content
