# Data Model (v0.1)

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
  post_id TEXT NOT NULL,
  author_id TEXT NOT NULL,
  author_name TEXT,

  canonical_content JSONB NOT NULL,

  decision TEXT NOT NULL,
  source TEXT NOT NULL,
  model TEXT,
  scores_json JSONB NOT NULL,

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
- both successful and failed LLM attempts are recorded
- failed attempts must set `attempt_status='error'` and include provider metadata fields
- table has no `user_id` column

## post_feedback

User feedback on rendered decisions.

```sql
CREATE TABLE post_feedback (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id),
  post_id TEXT NOT NULL,
  rendered_decision TEXT NOT NULL,
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

Consumption is done atomically in DB updates (`tryConsumeQuota`).

## user_activity

Per-classification activity rows used by stats endpoints.

```sql
CREATE TABLE user_activity (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id),
  post_id TEXT NOT NULL,
  decision TEXT NOT NULL,
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
