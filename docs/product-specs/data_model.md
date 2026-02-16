---
owner: unslop
status: verified
last_verified: 2026-02-16
---

# Data Model (v0.1)

## problem
Backend services require a clear, enforceable schema for identity, classification caching/events, feedback, usage, and billing idempotency.

## non_goals
- Analytics-only tables and speculative storage not tied to v0.1 behavior.
- Ambiguous schema ownership outside `backend/src/db/schema.ts`.

## acceptance_criteria
- AC1: Core tables and invariants are documented and map to backend schema source of truth.
- AC2: Cache, event, feedback, usage, and webhook idempotency data policies are explicit.
- AC3: Decision-domain and retention-related schema semantics are consistent with product specs.

## constraints
- Performance: Indexes support high-frequency classify/event/write paths.
- Security/Privacy: Store minimal required fields and avoid unnecessary sensitive duplication.
- Compatibility: Schema must align with repository/service contracts and migrations.

## telemetry
- Logs: Migration outcomes, write failures, and integrity violations.
- Metrics: Table growth, cache hit/write rates, event/error persistence rates.
- Traces: DB operation spans for classify, billing, and feedback flows.

## test_plan
- Unit: Repository-level invariants and serialization assumptions.
- Integration: Migration compatibility and repository behavior against real DB.
- E2E: End-to-end classify/billing paths persist expected rows.

## rollout
- Flags: No schema flags; use explicit migrations.
- Migration: Drizzle-managed forward migrations with reversible-safe sequencing.
- Backout: Roll back app code and apply DB rollback procedures when supported.

Database: Postgres (Neon in production).

Source of truth: `backend/src/db/schema.ts`.

## Notes

- UUID defaults use `gen_random_uuid()`.
- No `uuid-ossp` extension requirement.
- Names below use SQL column names.

## users

Stores identity and billing state.

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  plan TEXT NOT NULL DEFAULT 'free',
  plan_status TEXT NOT NULL DEFAULT 'inactive',
  polar_customer_id TEXT,
  polar_subscription_id TEXT,
  subscription_period_start TIMESTAMPTZ,
  subscription_period_end TIMESTAMPTZ
);
```

## classification_cache

Classification cache keyed by deterministic `content_fingerprint` (global, cross-user).

```sql
CREATE TABLE classification_cache (
  content_fingerprint TEXT PRIMARY KEY,
  decision TEXT NOT NULL, -- keep | hide
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_classification_cache_created_at ON classification_cache(created_at);
CREATE INDEX idx_classification_cache_updated_at ON classification_cache(updated_at);
```

Cache policy:

- key = `content_fingerprint` from canonical request payload
- no `user_id` in cache key
- fixed TTL is 30 days from `created_at` (non-sliding)
- cache rows are minimal (`content_fingerprint`, `decision`, timestamps)
- cache rows are written only after successful LLM outcomes

## classification_events

Append-only rows for actual LLM attempts (cache misses only).

```sql
CREATE TABLE classification_events (
  id BIGSERIAL PRIMARY KEY,
  content_fingerprint TEXT NOT NULL,
  post_id TEXT NOT NULL,
  model TEXT,

  attempt_status TEXT NOT NULL, -- success | error
  provider_http_status INT,
  provider_error_code TEXT,
  provider_error_type TEXT,
  provider_error_message TEXT,

  request_payload JSONB NOT NULL,
  response_payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_classification_events_fingerprint ON classification_events(content_fingerprint);
CREATE INDEX idx_classification_events_post_id ON classification_events(post_id);
CREATE INDEX idx_classification_events_attempt_status ON classification_events(attempt_status);
CREATE INDEX idx_classification_events_created_at ON classification_events(created_at);
```

Event policy:

- rows exist only for attempted provider calls (no cache-hit rows)
- only failed LLM attempts are persisted in normal flow (`attempt_status='error'`)
- failed attempts include provider metadata fields when available
- request/response payload columns are intentionally compact placeholders
- table has no `user_id` column

## post_feedback

User feedback on rendered decisions.

```sql
CREATE TABLE post_feedback (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id),
  post_id TEXT NOT NULL,
  rendered_decision TEXT NOT NULL, -- keep | hide
  user_label TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_feedback_post_id ON post_feedback(post_id);
CREATE INDEX idx_feedback_user_id ON post_feedback(user_id);
```

## user_usage

Quota consumption ledger by user + period start.

```sql
CREATE TABLE user_usage (
  user_id UUID NOT NULL REFERENCES users(id),
  month_start DATE NOT NULL,
  llm_calls INT NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, month_start)
);
```

Consumption is accumulated and written with batched `incrementUsageBy` updates.

Period anchor semantics:

- Free windows: `month_start` is anchored to `users.created_at` (UTC monthly cycle by creation day/time).
- Pro windows: `month_start` is anchored to `users.subscription_period_start`.
- If Pro entitlement is inactive/expired, usage keys return to free anchor semantics.

## user_activity

Per-classification activity rows used by stats endpoints.

```sql
CREATE TABLE user_activity (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id),
  post_id TEXT NOT NULL,
  decision TEXT NOT NULL, -- keep | hide
  source TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_activity_user_id_created_at ON user_activity(user_id, created_at);
```

## webhook_deliveries

Billing webhook idempotency records.

```sql
CREATE TABLE webhook_deliveries (
  webhook_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  subscription_id TEXT,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```
