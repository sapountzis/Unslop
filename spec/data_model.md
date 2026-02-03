# Data Model (v0.1)

Database: Neon Postgres

This schema supports only:
- identity + plan status
- cached post decisions (to reduce duplicate LLM calls)
- feedback capture
- monthly usage counters for quotas

## Extensions

```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
```

---

## Table: users

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- plan & billing
  plan TEXT NOT NULL DEFAULT 'free',            -- 'free' | 'pro'
  plan_status TEXT NOT NULL DEFAULT 'inactive', -- 'active' | 'inactive'
  polar_customer_id TEXT,
  polar_subscription_id TEXT
);
```

---

## Table: posts

A cached decision per LinkedIn post.

```sql
CREATE TABLE posts (
  post_id TEXT PRIMARY KEY,        -- LinkedIn ID or derived hash
  author_id TEXT NOT NULL,
  author_name TEXT,

  content_text TEXT NOT NULL,      -- normalized + truncated (<= 4000 chars)
  content_hash TEXT NOT NULL,      -- SHA-256 of content_text (hex)

  decision TEXT NOT NULL,          -- 'keep' | 'dim' | 'hide'
  source TEXT NOT NULL,            -- 'llm' | 'cache' | 'error'
  model TEXT,                      -- e.g. 'openrouter:gpt-...'; nullable

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_posts_author_id ON posts(author_id);
CREATE INDEX idx_posts_updated_at ON posts(updated_at);
```

### Post ID derivation

If LinkedIn provides a stable post ID in the DOM, use that.

Otherwise derive:

- `post_id = hex(SHA-256(author_id + "\n" + content_text))`

### Normalization + truncation (must be consistent)

1. Extract full visible post text.
2. Normalize: lowercase, collapse whitespace, trim.
3. Truncate to 4000 chars.
4. Use this as `content_text`.
5. `content_hash = hex(SHA-256(content_text))`

---

## Table: post_feedback

```sql
CREATE TABLE post_feedback (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id),
  post_id TEXT NOT NULL REFERENCES posts(post_id),

  rendered_decision TEXT NOT NULL,  -- 'keep' | 'dim' | 'hide'
  user_label TEXT NOT NULL,         -- 'should_keep' | 'should_hide'

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_feedback_post_id ON post_feedback(post_id);
CREATE INDEX idx_feedback_user_id ON post_feedback(user_id);
```

---

## Table: user_usage

```sql
CREATE TABLE user_usage (
  user_id UUID NOT NULL REFERENCES users(id),
  month_start DATE NOT NULL,        -- YYYY-MM-01 in UTC
  llm_calls INT NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, month_start)
);
```

Increment:
- On LLM calls, UPSERT + `llm_calls = llm_calls + 1`.
