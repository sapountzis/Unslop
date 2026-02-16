---
owner: unslop
status: verified
last_verified: 2026-02-16
---

# Unslop – Minimal Project Spec (v0.1)

## problem
Users need a minimal, fail-open way to filter low-value social feed content without introducing brittle UI complexity.

## non_goals
- Model training, student models, or heuristic classifiers.
- Per-author tuning/rules and analytics dashboards.
- Non-extension product surfaces (mobile app, web app dashboard).

## acceptance_criteria
- AC1: Extension can classify and render `keep|hide` decisions without breaking browsing.
- AC2: Backend provides auth, classification, billing, and quota behavior defined by linked specs.
- AC3: Public site exposes install, privacy, and support pages with static hosting constraints.

## constraints
- Performance: Classification must fail open and tolerate provider failures/timeouts.
- Security/Privacy: Minimize stored data and avoid sensitive payload leakage in logs.
- Compatibility: Must work with Chrome MV3, backend API, and static site deployment.

## telemetry
- Logs: Classification outcomes, source (`llm|cache|error`), and high-level errors.
- Metrics: Classification throughput/latency, cache hit rate, quota enforcement rates.
- Traces: Request-level auth/classification/billing route execution where available.

## test_plan
- Unit: Domain constants, scoring logic, extension rendering primitives.
- Integration: API routes, billing webhooks, quota enforcement, repository behavior.
- E2E: Auth + classify + extension runtime + UI smoke.

## rollout
- Flags: No feature flags required for v0.1 scope.
- Migration: Data schema evolves through Drizzle migrations.
- Backout: Revert deployment and rollback migration-compatible changes as needed.

Unslop is a Chrome extension + backend API that filters supported social feeds (LinkedIn, X, Reddit) by **hiding posts** according to a backend decision.

v0.1 also includes a minimal public website (`getunslop.com`) for trust + policy/support pages.

## v0.1 goal

Ship the smallest product that:

1) Works on `https://www.linkedin.com/*`, `https://x.com/*` (`https://twitter.com/*`), and `https://www.reddit.com/*` (`https://old.reddit.com/*`) without breaking browsing.
2) Calls a backend API for each new post (or uses cached decisions).
3) Applies one of two actions: `keep`, `hide`.
4) Supports email magic-link login (JWT).
5) Supports a subscription (Polar) with Free vs Pro quotas.
6) Stores minimal data for future improvements:
   - `content_fingerprint`, `decision`, timestamps in classification cache
   - compact error telemetry rows in `classification_events` (provider metadata only; best-effort)
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

Quota is evaluated from a snapshot and usage is incremented in batched write-behind updates.

`classification_events` rows are error-only compact telemetry and are flushed best-effort.

## Document map

- `infra.md` – runtime + deploy + env vars + domains
- `api.md` – endpoints + payloads
- `data_model.md` – schema
- `extension.md` – extension behavior
- `billing.md` – plans + quotas + Polar
- `ml.md` – LLM/VLM routing + prompt contract
- `frontend.md` – public site pages + required content
