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

## posts

Classification cache keyed by `post_id`.

```sql
CREATE TABLE posts (
  post_id TEXT PRIMARY KEY,
  author_id TEXT NOT NULL,
  author_name TEXT,

  content_text TEXT NOT NULL,
  content_hash TEXT NOT NULL,

  decision TEXT NOT NULL,
  source TEXT NOT NULL,
  model TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_posts_author_id ON posts(author_id);
CREATE INDEX idx_posts_updated_at ON posts(updated_at);
```

## post_feedback

User feedback on rendered decisions.

```sql
CREATE TABLE post_feedback (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id),
  post_id TEXT NOT NULL REFERENCES posts(post_id),
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

CREATE INDEX idx_activity_user_id ON user_activity(user_id);
CREATE INDEX idx_activity_created_at ON user_activity(created_at);
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

CREATE INDEX idx_webhook_deliveries_event_type ON webhook_deliveries(event_type);
CREATE INDEX idx_webhook_deliveries_webhook_id ON webhook_deliveries(webhook_id);
CREATE INDEX idx_webhook_deliveries_subscription_id ON webhook_deliveries(subscription_id);
CREATE INDEX idx_webhook_deliveries_processed_at ON webhook_deliveries(processed_at);
```
