# Database Guide (Drizzle ORM v1 beta)

Source of truth:

- schema: `backend/src/db/schema.ts`
- generated SQL migrations: `backend/drizzle/*/migration.sql`

## Runtime Drivers

`backend/src/db/index.ts` selects driver by `DATABASE_URL`:

- Neon URL => `drizzle-orm/neon-http`
- other Postgres URL => `drizzle-orm/postgres-js`

Both are instantiated with `{ schema }` for typed queries.

## Migration Commands

From `backend/`:

- generate migration files: `bun run migrate:generate`
- apply migration files (Drizzle Kit): `bun run migrate`
- apply via runtime migrator helper: `bun run migrate:push`

Use `generate + migrate` for reviewable, commit-safe schema changes.

## Current Tables

- `users`
- `posts`
- `post_feedback`
- `user_usage`
- `user_activity`
- `webhook_deliveries`

## Schema Change Workflow

1. Edit `src/db/schema.ts`.
2. Generate migration:
   - `cd backend && bun run migrate:generate`
3. Review generated SQL in new `drizzle/<timestamp>_<name>/migration.sql`.
4. Apply migration locally:
   - `cd backend && bun run migrate`
5. Run checks:
   - `cd backend && bun run type-check`
   - `cd backend && bun run test:unit`

## UUID Defaults

Use Postgres built-in `gen_random_uuid()` in schema defaults.

Example:

```ts
id: uuid('id').primaryKey().default(sql`gen_random_uuid()`)
```

## Local Development Notes

- local Postgres is expected from repo `docker compose`
- set `DATABASE_URL` in `backend/.env`
- migrations are tracked in `drizzle.__drizzle_migrations`

## Production Notes

- commit generated migration directories to git
- run migrations during deploy before serving traffic
- keep migration SQL immutable once committed

## Troubleshooting

### Migration generation creates unexpected SQL

- verify schema file changed as intended
- ensure no manual edits in generated migration folders

### Runtime query/type mismatch

- confirm `db` instance is using schema-typed drizzle initialization
- rerun `bun run type-check`

### Webhook idempotency records missing

- verify `webhook_deliveries` table exists from latest migration
- verify billing webhook route receives `webhook-id` header
