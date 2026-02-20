# Database Guide (Plain English)

This document describes the current Unslop backend Postgres schema and local migration workflow.

Source of truth:

- schema code: `backend/src/db/schema.ts`
- initial baseline migration SQL: `backend/drizzle/20260209164213_moaning_nitro/migration.sql`
- follow-up migration SQL: `backend/drizzle/20260209181215_graceful_molecule_man/migration.sql` (drops conflicting unique `post_id` cache index)

## Quick mental model

- A **table** stores records.
- A **primary key** uniquely identifies a row.
- A **foreign key** links tables.
- An **index** speeds up lookups.
- A **constraint** blocks invalid states.

## Why this schema exists

The backend needs to:

1. Store users and subscription state.
2. Cache successful classification decisions by deterministic content fingerprint.
3. Record all real LLM attempts (success and error) as append-only events.
4. Store user feedback and per-user activity/usage.
5. Store processed webhooks for idempotency.

## Enums in use

- `plan`: `free | pro`
- `plan_status`: `inactive | active | canceled | past_due`
- `decision`: `keep | hide`
- `post_source`: `llm | cache | error`
- `activity_source`: `llm | cache`
- `feedback_label`: `should_keep | should_hide`
- `classification_attempt_status`: `success | error`

## Table overview

### `users`

Purpose:

- One row per user.
- Stores auth + billing identifiers and billing period timestamps.

Key constraints/indexes:

- primary key: `id` (UUID, `gen_random_uuid()`)
- unique: `email`
- unique indexes: `idx_users_polar_customer_id`, `idx_users_polar_subscription_id`

### `classification_cache`

Purpose:

- Global cache keyed by canonical `content_fingerprint`.
- Stores only successful classification outcomes with full score payload.

Key columns:

- `content_fingerprint` (primary key)
- `post_id`, `author_id`, `author_name`
- `canonical_content` (`jsonb`)
- `decision`, `source`, `model`, `scores_json`
- `created_at`, `updated_at`

Indexes:

- non-unique: `idx_classification_cache_created_at`, `idx_classification_cache_updated_at`

### `classification_events`

Purpose:

- Append-only ledger for successful LLM attempts (cache misses only).
- Success events only; errors are not persisted.

Key columns:

- `id` (`bigserial` primary key)
- `content_fingerprint`, `post_id`, `model`
- `attempt_status`
- provider error/status metadata fields
- `request_payload`, `response_payload` (`jsonb`)
- `created_at`

Key constraint:

- `classification_events_error_metadata_check`: if `attempt_status='error'`, at least one provider error/status field must be present.

Indexes:

- `idx_classification_events_fingerprint`
- `idx_classification_events_post_id`
- `idx_classification_events_attempt_status`
- `idx_classification_events_created_at`

### `post_feedback`

Purpose:

- User feedback on rendered decisions.

Key columns:

- `id` (`bigserial` primary key)
- `user_id` -> `users.id` (FK, `ON DELETE CASCADE`)
- `post_id` (text, no FK)
- `rendered_decision`, `user_label`, `created_at`

Indexes:

- `idx_feedback_post_id`
- `idx_feedback_user_id`

### `user_usage`

Purpose:

- Quota counter by user and billing period anchor.

Key constraints:

- composite primary key: (`user_id`, `month_start`)
- `llm_calls >= 0`
- `user_id` FK -> `users.id` with `ON DELETE CASCADE`

### `user_activity`

Purpose:

- Per-user activity rows used by stats endpoints.

Key constraints/indexes:

- `user_id` FK -> `users.id` with `ON DELETE CASCADE`
- index: `idx_activity_user_id_created_at`

### `webhook_deliveries`

Purpose:

- Idempotency ledger for webhook processing.

Key constraints:

- primary key: `webhook_id`

## Relationships

- `users` 1 -> many `post_feedback`
- `users` 1 -> many `user_usage`
- `users` 1 -> many `user_activity`

`classification_cache` and `classification_events` are intentionally global and do not reference `users`.

## Migration model

Current state is:

- baseline schema migration: `backend/drizzle/20260209164213_moaning_nitro/migration.sql`
- additive migration: `backend/drizzle/20260209181215_graceful_molecule_man/migration.sql`
- additive migration: `backend/drizzle/20260209195359_bizarre_doctor_octopus/migration.sql` (enforces `classification_cache.source='llm'`)
- additive migration: `backend/drizzle/20260210103000_remove_dim_decision/migration.sql` (maps historical `dim` decisions to `hide` and shrinks enum to `keep|hide`)

Migration history is intentionally kept additive. The early unique `idx_classification_cache_post_id` churn is preserved in history and corrected by follow-up migration, rather than rewriting migration lineage.

Future schema changes should be additive migrations generated from `backend/src/db/schema.ts`.

## Local development workflow

From repo root, ensure local Postgres is running:

```bash
docker compose up -d
```

From `backend/`:

```bash
# generate migration SQL from schema
bun run migrate:generate

# apply migrations to DATABASE_URL
bun run migrate
```

### Clean reset workflow (full DB nuke + fresh baseline)

Use this when you intentionally want a fresh database and regenerated migration baseline.

```bash
# 1) recreate the database inside the postgres container
docker exec unslop-postgres psql -U unslop -d template1 -v ON_ERROR_STOP=1 \
  -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'unslop' AND pid <> pg_backend_pid();" \
  -c "DROP DATABASE IF EXISTS unslop;" \
  -c "CREATE DATABASE unslop OWNER unslop;"

# 2) delete prior migration artifacts
rm -rf backend/drizzle/*

# 3) regenerate baseline migration
cd backend && bun run migrate:generate

# 4) apply baseline migration
cd backend && bun run migrate
```

## Environment notes

- `DATABASE_URL` must point at your target DB.
- Model routing vars are both required in backend runtime config:
  - `LLM_MODEL` (text path)
  - `VLM_MODEL` (multimodal path)
