# Database Guide (Plain English)

This document explains the Unslop database as if you are new to PostgreSQL.

Source of truth:

- schema code: `backend/src/db/schema.ts`
- generated SQL: `backend/drizzle/20260205215244_tired_millenium_guard/migration.sql`
- docker bootstrap SQL: `backend/drizzle/init.sql`

## Quick mental model

- A **table** is like a spreadsheet.
- A **row** is one record.
- A **column** is one field.
- A **primary key** is the row's unique ID.
- A **foreign key** links rows between tables.
- An **index** is a lookup helper for faster reads.
- A **constraint** is a rule that blocks invalid data.

## Why this schema exists

The backend only needs to do a few things:

1. Store users and their subscription state.
2. Store classification decisions for posts.
3. Store user feedback on decisions.
4. Track usage and activity for quotas/stats.
5. Track processed webhook events for idempotency.

Everything in the schema maps directly to those jobs.

## PostgreSQL features we use (and why)

### `pgcrypto` extension

We enable:

- `CREATE EXTENSION IF NOT EXISTS "pgcrypto";`

Why:

- Gives us `gen_random_uuid()` for user IDs.
- Avoids custom UUID generation code in app logic.

### Enums (restricted text values)

We define PostgreSQL enums for fields with fixed allowed values:

- `plan`: `free | pro`
- `plan_status`: `inactive | active | canceled | past_due`
- `decision`: `keep | dim | hide`
- `post_source`: `llm | cache | error`
- `activity_source`: `llm | cache`
- `feedback_label`: `should_keep | should_hide`

Why:

- Prevents typo data (`activ`, `kep`, etc.) from ever entering DB.
- Makes app logic safer because invalid states are impossible at storage level.

## Table-by-table explanation

### `users`

Purpose:

- One row per user account.
- Stores auth identity (`id`, `email`) and billing status.

Important columns:

- `id` (UUID primary key, default `gen_random_uuid()`).
- `email` (required, unique).
- `plan` + `plan_status` (required enums with defaults).
- `polar_customer_id`, `polar_subscription_id` (nullable, from Polar).
- `subscription_period_start`, `subscription_period_end` (nullable timestamps).

Constraints/indexes and why:

- `email` unique: no duplicate users for same email.
- unique index on `polar_customer_id`: a Polar customer maps to at most one local user.
- unique index on `polar_subscription_id`: a Polar subscription maps to at most one local user.

### `posts`

Purpose:

- Cache one latest decision per post ID.

Important columns:

- `post_id` (primary key).
- `author_id`, `author_name`.
- `content_text`, `content_hash`.
- `decision`, `source`, `model`.
- `created_at`, `updated_at`.

Constraints and why:

- `posts_content_text_len_check`: `char_length(content_text) <= 4000`.
- This enforces the same max length as app normalization, so DB cannot drift from app contract.

Why no extra indexes here:

- Most reads are by `post_id` (primary key already indexed).
- We removed low-value indexes that were not on hot query paths.

### `post_feedback`

Purpose:

- Stores user feedback about a rendered decision.

Important columns:

- `id` (bigserial primary key).
- `user_id` -> `users.id`.
- `post_id` -> `posts.post_id`.
- `rendered_decision`, `user_label`.
- `created_at`.

Foreign keys and why:

- `user_id` references `users` with `ON DELETE CASCADE`.
- `post_id` references `posts` with `ON DELETE CASCADE`.

`ON DELETE CASCADE` means:

- If a user/post is deleted, dependent feedback rows are auto-deleted.
- Prevents orphan rows and reduces manual cleanup code.

Indexes and why:

- `idx_feedback_user_id`: fast lookup of a user's feedback.
- `idx_feedback_post_id`: fast lookup of feedback for a post.

### `user_usage`

Purpose:

- Tracks quota consumption per user per billing month.

Important columns:

- `user_id`.
- `month_start` (date like `2026-02-01`).
- `llm_calls` counter.

Primary key design and why:

- Composite PK: `(user_id, month_start)`.
- Guarantees exactly one usage row per user per month.
- Makes atomic upsert/update logic simple and safe.

Checks and why:

- `llm_calls >= 0` (no negative counters).
- `month_start` must be month boundary via `date_trunc('month', ...)`.
- Prevents accidental invalid periods like `2026-02-14`.

Foreign key and why:

- `user_id` references `users` with `ON DELETE CASCADE`.

### `user_activity`

Purpose:

- Stores per-classification events used by stats endpoints.

Important columns:

- `id` (bigserial primary key).
- `user_id` (FK to users).
- `post_id` (text, tracked for linkage/debug context).
- `decision`, `source`, `created_at`.

Index and why:

- `idx_activity_user_id_created_at` on `(user_id, created_at)`.
- Matches real query pattern: filter by user and time window.
- Supports stats endpoints efficiently for daily/30-day views.

Foreign key and why:

- `user_id` references `users` with `ON DELETE CASCADE`.

### `webhook_deliveries`

Purpose:

- Records processed webhook IDs for idempotency.

Important columns:

- `webhook_id` (primary key).
- `event_type`.
- `subscription_id`.
- `processed_at`.

Why this design:

- Primary key on `webhook_id` means duplicate delivery can be detected by insert conflict.
- Keeps webhook processing safe to retry and safe against duplicate sends.
- Minimal metadata only (no oversized payload storage).

## Relationships diagram (simple)

- `users` 1 -> many `post_feedback`
- `users` 1 -> many `user_usage` (across months)
- `users` 1 -> many `user_activity`
- `posts` 1 -> many `post_feedback`

## Why some constraints are in DB (not only app code)

App validation is helpful, but DB constraints are the final guard.

If any code path has a bug, constraints still prevent bad data. This is especially important for:

- enum values
- quota counters
- monthly period boundaries
- foreign key integrity

## Migration model

Current state is intentionally squashed to one initial migration:

- `backend/drizzle/20260205215244_tired_millenium_guard/migration.sql`

Why:

- Project is pre-release and local-only.
- One clean baseline is easier to reason about than a long historical chain.
- Future changes should be additive migrations from this baseline.

## Local development flow

From repo root:

```bash
# reset local postgres completely
docker compose down -v && docker compose up -d
```

From `backend/`:

```bash
# generate migration after schema edits
bun run migrate:generate

# apply migrations to DATABASE_URL
bun run migrate

# runtime migrator path (alternative)
bun run migrate:push
```

## Driver behavior

`backend/src/db/index.ts` uses explicit runtime driver config:

- `DB_DRIVER=neon` -> `drizzle-orm/neon-http`
- `DB_DRIVER=postgres` -> `drizzle-orm/postgres-js`

Fallback:

- when `DB_DRIVER` is not set, runtime infers from URL (`*.neon.*` => `neon`, otherwise `postgres`).

Why:

- Explicit driver selection is clearer and safer than implicit URL heuristics alone.
- Fallback inference preserves local convenience for existing environments.

## Practical guardrails for future changes

1. Add/modify columns in `backend/src/db/schema.ts` first.
2. Generate SQL migration (never hand-wave DB changes).
3. Keep constraints close to business rules.
4. Add indexes only for real query paths (not speculative indexes).
5. Run `bun run type-check && bun run test:unit` after schema changes.
