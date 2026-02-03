# Database Schema & Migrations Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Set up Postgres database with complete schema for users, posts, feedback, and usage tracking.

**Architecture:** Drizzle ORM with Neon Postgres, using migrations for schema versioning.

**Tech Stack:** Bun, Drizzle ORM 0.45.x, Neon Postgres (HTTP driver)

---

## Task 1: Initialize Drizzle ORM and project structure

**Files:**
- Create: `backend/package.json`
- Create: `backend/tsconfig.json`
- Create: `backend/drizzle.config.ts`
- Create: `backend/src/db/schema.ts`
- Create: `backend/src/db/index.ts`

**Step 1: Create package.json**

```json
{
  "name": "unslop-backend",
  "version": "0.1.0",
  "scripts": {
    "dev": "bun run src/index.ts",
    "start": "bun run src/index.ts",
    "migrate": "drizzle-kit migrate",
    "migrate:generate": "drizzle-kit generate"
  },
  "dependencies": {
    "@hono/zod-validator": "^0.4.0",
    "drizzle-orm": "^0.45.0",
    "hono": "^4.11.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "drizzle-kit": "^0.45.0",
    "typescript": "^5.9.0"
  }
}
```

**Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "lib": ["ES2022"],
    "moduleResolution": "bundler",
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "types": ["node", "bun-types"]
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules"]
}
```

**Step 3: Install dependencies**

Run: `cd backend && bun install`

**Step 4: Create drizzle.config.ts**

```typescript
import type { Config } from 'drizzle-kit';

export default {
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
} satisfies Config;
```

**Step 5: Commit**

```bash
git add backend/package.json backend/tsconfig.json backend/drizzle.config.ts
git commit -m "feat: initialize Drizzle ORM project structure"
```

---

## Task 2: Define users table schema

**Files:**
- Modify: `backend/src/db/schema.ts`

**Step 1: Write the schema**

```typescript
// backend/src/db/schema.ts
import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').unique().notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),

  // plan & billing
  plan: text('plan').notNull().default('free'), // 'free' | 'pro'
  planStatus: text('plan_status').notNull().default('inactive'), // 'active' | 'inactive'
  polarCustomerId: text('polar_customer_id'),
  polarSubscriptionId: text('polar_subscription_id'),
});
```

**Step 2: Run type check**

Run: `cd backend && bun run tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add backend/src/db/schema.ts
git commit -m "feat: add users table schema"
```

---

## Task 3: Define posts table schema

**Files:**
- Modify: `backend/src/db/schema.ts`

**Step 1: Add posts table to schema**

```typescript
// Add to backend/src/db/schema.ts
export const posts = pgTable('posts', {
  postId: text('post_id').primaryKey(),
  authorId: text('author_id').notNull(),
  authorName: text('author_name'),

  contentText: text('content_text').notNull(), // normalized + truncated (<= 4000 chars)
  contentHash: text('content_hash').notNull(), // SHA-256 of content_text (hex)

  decision: text('decision').notNull(), // 'keep' | 'dim' | 'hide'
  source: text('source').notNull(), // 'llm' | 'cache' | 'error'
  model: text('model'), // e.g. 'openrouter:gpt-...'; nullable

  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});
```

**Step 2: Run type check**

Run: `cd backend && bun run tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add backend/src/db/schema.ts
git commit -m "feat: add posts table schema"
```

---

## Task 4: Define post_feedback table schema

**Files:**
- Modify: `backend/src/db/schema.ts`

**Step 1: Add post_feedback table to schema**

```typescript
// Add to backend/src/db/schema.ts
import { bigserial, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './users';
import { posts } from './posts';

export const postFeedback = pgTable('post_feedback', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id),
  postId: text('post_id').notNull().references(() => posts.postId),

  renderedDecision: text('rendered_decision').notNull(), // 'keep' | 'dim' | 'hide'
  userLabel: text('user_label').notNull(), // 'should_keep' | 'should_hide'

  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  postIdIdx: index('idx_feedback_post_id').on(table.postId),
  userIdIdx: index('idx_feedback_user_id').on(table.userId),
}));
```

**Step 2: Run type check**

Run: `cd backend && bun run tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add backend/src/db/schema.ts
git commit -m "feat: add post_feedback table schema"
```

---

## Task 5: Define user_usage table schema

**Files:**
- Modify: `backend/src/db/schema.ts`

**Step 1: Add user_usage table to schema**

```typescript
// Add to backend/src/db/schema.ts
import { pgTable, serial, text, timestamp, uuid, date } from 'drizzle-orm/pg-core';
import { users } from './users';

export const userUsage = pgTable('user_usage', {
  userId: uuid('user_id').notNull().references(() => users.id),
  monthStart: date('month_start').notNull(), // YYYY-MM-01 in UTC
  llmCalls: serial('llm_calls').notNull().default(0),
}, (table) => ({
  pk: { primaryKey: true, columns: [table.userId, table.monthStart] },
}));
```

**Step 2: Run type check**

Run: `cd backend && bun run tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add backend/src/db/schema.ts
git commit -m "feat: add user_usage table schema"
```

---

## Task 6: Create database connection module

**Files:**
- Create: `backend/src/db/index.ts`

**Step 1: Create database connection**

```typescript
// backend/src/db/index.ts
import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';

import * as schema from './schema';

const sql = neon(process.env.DATABASE_URL!);

export const db = drizzle(sql, { schema });
```

**Step 2: Update package.json to include Neon driver**

Run: `cd backend && bun add @neondatabase/serverless`

**Step 3: Run type check**

Run: `cd backend && bun run tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add backend/src/db/index.ts backend/package.json backend/bun.lockb
git commit -m "feat: add database connection with Neon driver"
```

---

## Task 7: Add indexes to posts table

**Files:**
- Modify: `backend/src/db/schema.ts`

**Step 1: Update posts table with indexes**

```typescript
// Replace the posts table export with this:
import { index, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export const posts = pgTable('posts', {
  postId: text('post_id').primaryKey(),
  authorId: text('author_id').notNull(),
  authorName: text('author_name'),

  contentText: text('content_text').notNull(),
  contentHash: text('content_hash').notNull(),

  decision: text('decision').notNull(),
  source: text('source').notNull(),
  model: text('model'),

  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  authorIdIdx: index('idx_posts_author_id').on(table.authorId),
  updatedAtIdx: index('idx_posts_updated_at').on(table.updatedAt),
}));
```

**Step 2: Run type check**

Run: `cd backend && bun run tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add backend/src/db/schema.ts
git commit -m "feat: add indexes to posts table"
```

---

## Task 8: Create initial migration

**Files:**
- Create: `backend/drizzle/0000_initial.sql` (auto-generated)

**Step 1: Generate migration**

Run: `cd backend && bun run migrate:generate`
Expected: Creates migration file in `drizzle/` directory

**Step 2: Verify migration file content**

Run: `cat backend/drizzle/*.sql`
Expected output should include:
- `CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`
- `CREATE TABLE users (...)`
- `CREATE TABLE posts (...)`
- `CREATE TABLE post_feedback (...)`
- `CREATE TABLE user_usage (...)`
- Indexes for posts and feedback tables

**Step 3: Commit**

```bash
git add backend/drizzle/
git commit -m "feat: generate initial database migration"
```

---

## Task 9: Create migration script and test locally

**Files:**
- Create: `backend/src/db/migrate.ts`

**Step 1: Create migration runner**

```typescript
// backend/src/db/migrate.ts
import { migrate } from 'drizzle-orm/neon-http/migrator';
import { db } from './index';

async function main() {
  console.log('Running migrations...');

  await migrate(db, { migrationsFolder: './drizzle' });

  console.log('Migrations completed!');
  process.exit(0);
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
```

**Step 2: Add migration script to package.json**

```json
// Add to backend/package.json scripts
"migrate:push": "bun run src/db/migrate.ts"
```

**Step 3: Test migration (requires DATABASE_URL set)**

Run: `cd backend && bun run migrate:push`
Expected: Tables created in Neon database

**Step 4: Commit**

```bash
git add backend/src/db/migrate.ts backend/package.json
git commit -m "feat: add migration runner script"
```

---

## Dependencies

- **None** - This is the foundational plan that all others depend on

---

## What's NOT included

- No API endpoints (covered in auth, classification, feedback, billing plans)
- No LLM integration (covered in classification plan)
- No email sending (covered in auth plan)
- No Polar integration (covered in billing plan)
