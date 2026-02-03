# Classification System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement LLM-based post classification with caching, quota enforcement, and usage tracking.

**Architecture:** Hono endpoint that checks cache → enforces quota → calls LLM → stores result → returns decision.

**Tech Stack:** Hono, OpenRouter API, Drizzle ORM, PostgreSQL

---

## Task 1: Create LLM service module

**Files:**
- Create: `backend/src/services/llm.ts`

**Step 1: Write LLM service**

```typescript
// backend/src/services/llm.ts
export interface PostInput {
  post_id: string;
  author_id: string;
  author_name: string;
  content_text: string;
}

export interface ClassificationResult {
  decision: 'keep' | 'dim' | 'hide';
}

export interface LLMCallResult {
  decision: 'keep' | 'dim' | 'hide';
  model: string;
  latency: number;
}

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY!;
const OPENROUTER_BASE_URL = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL!;

if (!OPENROUTER_API_KEY) {
  throw new Error('OPENROUTER_API_KEY environment variable is required');
}
if (!OPENROUTER_MODEL) {
  throw new Error('OPENROUTER_MODEL environment variable is required');
}

const SYSTEM_PROMPT = `You are a strict JSON generator. Your job is to decide if a LinkedIn post should be kept, dimmed, or hidden.

Rules:
- Keep posts that are genuine, thoughtful, or from real connections.
- Dim posts that are low-quality but not harmful (vague platitudes, engagement bait).
- Hide posts that are spam, scams, or clearly automated nonsense.

When uncertain, default to "keep".

Output ONLY a JSON object with this exact schema:
{"decision": "keep" | "dim" | "hide"}`;

export async function classifyPost(post: PostInput): Promise<LLMCallResult> {
  const startTime = Date.now();

  const userMessage = `Author: ${post.author_name} (ID: ${post.author_id})
Content: ${post.content_text}`;

  try {
    const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://unslop.xyz',
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userMessage },
        ],
        temperature: 0.1,
        max_tokens: 50,
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenRouter API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content;

    if (!content) {
      throw new Error('Empty response from LLM');
    }

    const parsed = JSON.parse(content) as ClassificationResult;

    if (!['keep', 'dim', 'hide'].includes(parsed.decision)) {
      throw new Error(`Invalid decision: ${parsed.decision}`);
    }

    const latency = Date.now() - startTime;

    return {
      decision: parsed.decision,
      model: OPENROUTER_MODEL,
      latency,
    };
  } catch (err) {
    // On error, fail open to "keep"
    console.error('LLM classification failed:', err);
    return {
      decision: 'keep',
      model: OPENROUTER_MODEL,
      latency: Date.now() - startTime,
    };
  }
}
```

**Step 2: Run type check**

Run: `cd backend && bun run tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add backend/src/services/llm.ts
git commit -m "feat: add LLM classification service"
```

---

## Task 2: Create quota enforcement service

**Files:**
- Create: `backend/src/services/quota.ts`

**Step 1: Write quota service**

```typescript
// backend/src/services/quota.ts
import { db } from '../db';
import { users, userUsage } from '../db/schema';
import { eq, and } from 'drizzle-orm';

const FREE_MONTHLY_LLM_CALLS = parseInt(process.env.FREE_MONTHLY_LLM_CALLS || '300');
const PRO_MONTHLY_LLM_CALLS = parseInt(process.env.PRO_MONTHLY_LLM_CALLS || '10000');

export interface QuotaCheckResult {
  allowed: boolean;
  currentUsage: number;
  limit: number;
  plan: string;
}

export async function checkQuota(userId: string): Promise<QuotaCheckResult> {
  // Get user's plan
  const userRecords = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (userRecords.length === 0) {
    return { allowed: false, currentUsage: 0, limit: 0, plan: 'unknown' };
  }

  const user = userRecords[0];

  // Determine limit
  const isPro = user.plan === 'pro' && user.planStatus === 'active';
  const limit = isPro ? PRO_MONTHLY_LLM_CALLS : FREE_MONTHLY_LLM_CALLS;

  // Get current month's usage
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const usageRecords = await db
    .select()
    .from(userUsage)
    .where(
      and(
        eq(userUsage.userId, userId),
        eq(userUsage.monthStart, monthStart.toISOString().split('T')[0])
      )
    )
    .limit(1);

  const currentUsage = usageRecords[0]?.llmCalls || 0;

  return {
    allowed: currentUsage < limit,
    currentUsage,
    limit,
    plan: user.plan,
  };
}

export async function incrementUsage(userId: string): Promise<void> {
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const monthStartStr = monthStart.toISOString().split('T')[0];

  // UPSERT usage record
  await db
    .insert(userUsage)
    .values({
      userId,
      monthStart: monthStartStr,
      llmCalls: 1,
    })
    .onConflictDoUpdate({
      target: [userUsage.userId, userUsage.monthStart],
      set: {
        llmCalls: sql`${userUsage.llmCalls} + 1`,
      },
    });
}
```

Note: Need to import sql from drizzle-orm. Let me fix:

```typescript
// Correct import at top
import { db } from '../db';
import { users, userUsage } from '../db/schema';
import { eq, and, sql } from 'drizzle-orm';
```

**Step 2: Run type check**

Run: `cd backend && bun run tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add backend/src/services/quota.ts
git commit -m "feat: add quota enforcement service"
```

---

## Task 3: Create content hash utility

**Files:**
- Create: `backend/src/lib/hash.ts`

**Step 1: Write hash utility**

```typescript
// backend/src/lib/hash.ts
import { createHash } from 'crypto';

/**
 * Normalize content text for hashing and storage
 * Matches the extension's normalization
 */
export function normalizeContentText(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 4000);
}

/**
 * Generate SHA-256 hash of content text (hex string)
 */
export function hashContentText(contentText: string): string {
  return createHash('sha256').update(contentText, 'utf-8').digest('hex');
}

/**
 * Derive post_id from author_id and content_text
 * Used when LinkedIn doesn't provide a stable post ID
 */
export function derivePostId(authorId: string, contentText: string): string {
  const combined = `${authorId}\n${contentText}`;
  return createHash('sha256').update(combined, 'utf-8').digest('hex');
}
```

**Step 2: Run type check**

Run: `cd backend && bun run tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add backend/src/lib/hash.ts
git commit -m "feat: add content hashing utilities"
```

---

## Task 4: Implement POST /v1/classify endpoint

**Files:**
- Create: `backend/src/routes/classify.ts`

**Step 1: Write classify endpoint**

```typescript
// backend/src/routes/classify.ts
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { db } from '../db';
import { posts } from '../db/schema';
import { eq } from 'drizzle-orm';
import { classifyPost, type PostInput } from '../services/llm';
import { checkQuota, incrementUsage } from '../services/quota';
import { hashContentText, normalizeContentText } from '../lib/hash';

const classify = new Hono();

const classifySchema = z.object({
  post: z.object({
    post_id: z.string(),
    author_id: z.string(),
    author_name: z.string(),
    content_text: z.string().max(4000),
  }),
});

// Auth middleware (inline for this route)
const authMiddleware = async (c: any, next: any) => {
  const authHeader = c.req.header('Authorization');

  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const token = authHeader.substring(7);

  try {
    const { verifySessionToken } = await import('../lib/jwt');
    const payload = verifySessionToken(token);
    c.set('user', payload);
    await next();
  } catch (err) {
    return c.json({ error: 'Invalid token' }, 401);
  }
};

// POST /v1/classify
classify.post('/v1/classify', authMiddleware, zValidator('json', classifySchema), async (c) => {
  const user = c.get('user');
  const { post } = c.req.valid('json');

  const postId = post.post_id;
  const normalizedContent = normalizeContentText(post.content_text);
  const contentHash = hashContentText(normalizedContent);

  // Check cache first
  const cached = await db
    .select()
    .from(posts)
    .where(eq(posts.postId, postId))
    .limit(1);

  const POST_CACHE_TTL_DAYS = parseInt(process.env.POST_CACHE_TTL_DAYS || '7');
  const cacheExpiry = new Date();
  cacheExpiry.setDate(cacheExpiry.getDate() - POST_CACHE_TTL_DAYS);

  if (cached.length > 0 && cached[0].updatedAt > cacheExpiry) {
    // Cache hit
    return c.json({
      post_id: postId,
      decision: cached[0].decision,
      source: 'cache',
    });
  }

  // Check quota
  const quotaCheck = await checkQuota(user.sub);

  if (!quotaCheck.allowed) {
    return c.json({ error: 'quota_exceeded' }, 429);
  }

  // Call LLM
  const llmResult = await classifyPost({
    post_id: postId,
    author_id: post.author_id,
    author_name: post.author_name,
    content_text: normalizedContent,
  });

  // Store result (insert or update)
  await db
    .insert(posts)
    .values({
      postId: postId,
      authorId: post.author_id,
      authorName: post.author_name,
      contentText: normalizedContent,
      contentHash: contentHash,
      decision: llmResult.decision,
      source: 'llm',
      model: llmResult.model,
    })
    .onConflictDoUpdate({
      target: posts.postId,
      set: {
        decision: llmResult.decision,
        source: 'llm',
        model: llmResult.model,
        updatedAt: new Date(),
      },
    });

  // Increment usage
  await incrementUsage(user.sub);

  // Return result
  return c.json({
    post_id: postId,
    decision: llmResult.decision,
    source: 'llm',
  });
});

export { classify };
```

**Step 2: Mount the route in index.ts**

```typescript
// Add to backend/src/index.ts
import { classify } from './routes/classify';

// Mount classify routes
app.route('/', classify);
```

**Step 3: Run type check**

Run: `cd backend && bun run tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add backend/src/routes/classify.ts backend/src/index.ts
git commit -m "feat: implement /v1/classify endpoint"
```

---

## Task 5: Create tests for classify endpoint

**Files:**
- Create: `backend/src/routes/classify.test.ts`

**Step 1: Write tests**

```typescript
// backend/src/routes/classify.test.ts
import { describe, it, expect, beforeEach } from 'bun:test';
import { db } from '../db';
import { posts, userUsage, users } from '../db/schema';
import { eq } from 'drizzle-orm';
import { generateSessionToken } from '../lib/jwt';

const API_URL = 'http://localhost:3000';

async function createTestUser() {
  const user = await db
    .insert(users)
    .values({
      email: `test-${Date.now()}@example.com`,
      plan: 'free',
      planStatus: 'inactive',
    })
    .returning();

  return user[0];
}

async function getAuthToken(userId: string, email: string): Promise<string> {
  return generateSessionToken(userId, email);
}

describe('POST /v1/classify', () => {
  let authToken: string;
  let userId: string;

  beforeEach(async () => {
    const user = await createTestUser();
    userId = user.id;
    authToken = await getAuthToken(user.id, user.email);

    // Clear any existing usage for this user
    await db.delete(userUsage).where(eq(userUsage.userId, userId));
  });

  it('should reject unauthenticated requests', async () => {
    const res = await fetch(`${API_URL}/v1/classify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        post: {
          post_id: 'test-post-1',
          author_id: 'author-1',
          author_name: 'Test Author',
          content_text: 'Test content here',
        },
      }),
    });

    expect(res.status).toBe(401);
  });

  it('should return cached decision if available', async () => {
    // First, create a cached post
    await db.insert(posts).values({
      postId: 'cached-post-1',
      authorId: 'author-1',
      authorName: 'Test Author',
      contentText: 'cached content',
      contentHash: 'abc123',
      decision: 'dim',
      source: 'llm',
      model: 'test-model',
    });

    const res = await fetch(`${API_URL}/v1/classify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        post: {
          post_id: 'cached-post-1',
          author_id: 'author-1',
          author_name: 'Test Author',
          content_text: 'cached content',
        },
      }),
    });

    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.decision).toBe('dim');
    expect(data.source).toBe('cache');
  });

  it('should enforce quota for free users', async () => {
    // Set up usage to exceed free tier
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
      .toISOString()
      .split('T')[0];

    await db.insert(userUsage).values({
      userId,
      monthStart,
      llmCalls: 500, // Exceeds default free quota of 300
    });

    const res = await fetch(`${API_URL}/v1/classify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        post: {
          post_id: 'new-post-1',
          author_id: 'author-1',
          author_name: 'Test Author',
          content_text: 'This is new content not in cache',
        },
      }),
    });

    expect(res.status).toBe(429);

    const data = await res.json();
    expect(data.error).toBe('quota_exceeded');
  });

  it('should normalize content text', async () => {
    const res = await fetch(`${API_URL}/v1/classify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        post: {
          post_id: 'normalization-test',
          author_id: 'author-1',
          author_name: 'Test Author',
          content_text: '  EXCESSIVE   WHITESPACE\n\nand  CAPS  ',
        },
      }),
    );

    expect(res.status).toBe(200);

    // Check that the stored content is normalized
    const stored = await db
      .select()
      .from(posts)
      .where(eq(posts.postId, 'normalization-test'))
      .limit(1);

    expect(stored.length).toBe(1);
    expect(stored[0].contentText).toBe('excessive whitespace and caps');
  });

  it('should increment usage on LLM call', async () => {
    const before = await db
      .select()
      .from(userUsage)
      .where(eq(userUsage.userId, userId))
      .limit(1);

    const beforeCount = before[0]?.llmCalls || 0;

    await fetch(`${API_URL}/v1/classify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        post: {
          post_id: 'usage-test-post',
          author_id: 'author-1',
          author_name: 'Test Author',
          content_text: 'Content for usage test',
        },
      }),
    });

    const after = await db
      .select()
      .from(userUsage)
      .where(eq(userUsage.userId, userId))
      .limit(1);

    const afterCount = after[0]?.llmCalls || 0;

    expect(afterCount).toBe(beforeCount + 1);
  });

  it('should not increment usage on cache hit', async () => {
    const monthStart = new Date(Date.UTC(Date.UTC(), 0, 1))
      .toISOString()
      .split('T')[0];

    // Insert cached post
    await db.insert(posts).values({
      postId: 'cache-hit-test',
      authorId: 'author-1',
      authorName: 'Test Author',
      contentText: 'cached content',
      contentHash: 'xyz',
      decision: 'keep',
      source: 'llm',
      model: 'test',
    });

    const before = await db
      .select()
      .from(userUsage)
      .where(eq(userUsage.userId, userId))
      .limit(1);

    const beforeCount = before[0]?.llmCalls || 0;

    await fetch(`${API_URL}/v1/classify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        post: {
          post_id: 'cache-hit-test',
          author_id: 'author-1',
          author_name: 'Test Author',
          content_text: 'cached content',
        },
      }),
    });

    const after = await db
      .select()
      .from(userUsage)
      .where(eq(userUsage.userId, userId))
      .limit(1);

    const afterCount = after[0]?.llmCalls || 0;

    expect(afterCount).toBe(beforeCount);
  });
});
```

**Step 2: Run tests**

Run: `cd backend && bun test`
Expected: All tests pass

**Step 3: Commit**

```bash
git add backend/src/routes/classify.test.ts
git commit -m "test: add classify endpoint tests"
```

---

## Dependencies

- **Requires:** `database-schema-migrations` plan (posts, user_usage tables)
- **Requires:** `auth-system` plan (JWT verification for auth middleware)

---

## What's NOT included

- No LLM provider switching (single model via env vars)
- No custom prompts per user
- No classification confidence scores
- No batch classification (single post only)
