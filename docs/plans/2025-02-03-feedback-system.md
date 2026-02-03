# Feedback System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement user feedback collection for classification decisions.

**Architecture:** Simple CRUD endpoint that inserts feedback records. No analysis in v0.1.

**Tech Stack:** Hono, Drizzle ORM, PostgreSQL

---

## Task 1: Implement POST /v1/feedback endpoint

**Files:**
- Create: `backend/src/routes/feedback.ts`

**Step 1: Write feedback endpoint**

```typescript
// backend/src/routes/feedback.ts
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { db } from '../db';
import { postFeedback, posts } from '../db/schema';
import { eq } from 'drizzle-orm';

const feedback = new Hono();

const feedbackSchema = z.object({
  post_id: z.string(),
  rendered_decision: z.enum(['keep', 'dim', 'hide']),
  user_label: z.enum(['should_keep', 'should_hide']),
});

// Auth middleware (inline)
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

// POST /v1/feedback
feedback.post('/v1/feedback', authMiddleware, zValidator('json', feedbackSchema), async (c) => {
  const user = c.get('user');
  const { post_id, rendered_decision, user_label } = c.req.valid('json');

  // Verify the post exists
  const postExists = await db
    .select()
    .from(posts)
    .where(eq(posts.postId, post_id))
    .limit(1);

  if (postExists.length === 0) {
    return c.json({ error: 'post_not_found' }, 404);
  }

  // Insert feedback record
  await db.insert(postFeedback).values({
    userId: user.sub,
    postId: post_id,
    renderedDecision: rendered_decision,
    userLabel: user_label,
  });

  return c.json({ status: 'ok' });
});

export { feedback };
```

**Step 2: Mount the route in index.ts**

```typescript
// Add to backend/src/index.ts
import { feedback } from './routes/feedback';

// Mount feedback routes
app.route('/', feedback);
```

**Step 3: Run type check**

Run: `cd backend && bun run tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add backend/src/routes/feedback.ts backend/src/index.ts
git commit -m "feat: implement /v1/feedback endpoint"
```

---

## Task 2: Create tests for feedback endpoint

**Files:**
- Create: `backend/src/routes/feedback.test.ts`

**Step 1: Write tests**

```typescript
// backend/src/routes/feedback.test.ts
import { describe, it, expect, beforeEach } from 'bun:test';
import { db } from '../db';
import { posts, postFeedback, users } from '../db/schema';
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

describe('POST /v1/feedback', () => {
  let authToken: string;
  let userId: string;
  let testPostId: string;

  beforeEach(async () => {
    const user = await createTestUser();
    userId = user.id;
    authToken = await getAuthToken(user.id, user.email);

    // Create a test post to reference
    testPostId = `test-post-${Date.now()}`;
    await db.insert(posts).values({
      postId: testPostId,
      authorId: 'test-author',
      authorName: 'Test Author',
      contentText: 'test content',
      contentHash: 'abc123',
      decision: 'dim',
      source: 'llm',
      model: 'test-model',
    });
  });

  it('should reject unauthenticated requests', async () => {
    const res = await fetch(`${API_URL}/v1/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        post_id: testPostId,
        rendered_decision: 'dim',
        user_label: 'should_keep',
      }),
    });

    expect(res.status).toBe(401);
  });

  it('should accept valid feedback', async () => {
    const res = await fetch(`${API_URL}/v1/feedback`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        post_id: testPostId,
        rendered_decision: 'dim',
        user_label: 'should_keep',
      }),
    });

    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data).toEqual({ status: 'ok' });
  });

  it('should store feedback in database', async () => {
    await fetch(`${API_URL}/v1/feedback`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        post_id: testPostId,
        rendered_decision: 'dim',
        user_label: 'should_hide',
      }),
    });

    const feedbackRecords = await db
      .select()
      .from(postFeedback)
      .where(eq(postFeedback.postId, testPostId));

    expect(feedbackRecords.length).toBe(1);
    expect(feedbackRecords[0].userId).toBe(userId);
    expect(feedbackRecords[0].renderedDecision).toBe('dim');
    expect(feedbackRecords[0].userLabel).toBe('should_hide');
  });

  it('should reject invalid rendered_decision', async () => {
    const res = await fetch(`${API_URL}/v1/feedback`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        post_id: testPostId,
        rendered_decision: 'invalid',
        user_label: 'should_keep',
      }),
    });

    expect(res.status).toBe(400);
  });

  it('should reject invalid user_label', async () => {
    const res = await fetch(`${API_URL}/v1/feedback`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        post_id: testPostId,
        rendered_decision: 'dim',
        user_label: 'invalid_label',
      }),
    });

    expect(res.status).toBe(400);
  });

  it('should return 404 for non-existent post', async () => {
    const res = await fetch(`${API_URL}/v1/feedback`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        post_id: 'non-existent-post',
        rendered_decision: 'dim',
        user_label: 'should_keep',
      }),
    });

    expect(res.status).toBe(404);

    const data = await res.json();
    expect(data.error).toBe('post_not_found');
  });

  it('should allow multiple feedback entries per post', async () => {
    // First feedback
    await fetch(`${API_URL}/v1/feedback`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        post_id: testPostId,
        rendered_decision: 'dim',
        user_label: 'should_hide',
      }),
    });

    // Second feedback (same post, different label)
    const res = await fetch(`${API_URL}/v1/feedback`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        post_id: testPostId,
        rendered_decision: 'keep',
        user_label: 'should_keep',
      }),
    });

    expect(res.status).toBe(200);

    const feedbackRecords = await db
      .select()
      .from(postFeedback)
      .where(eq(postFeedback.postId, testPostId));

    expect(feedbackRecords.length).toBe(2);
  });
});
```

**Step 2: Run tests**

Run: `cd backend && bun test`
Expected: All tests pass

**Step 3: Commit**

```bash
git add backend/src/routes/feedback.test.ts
git commit -m "test: add feedback endpoint tests"
```

---

## Dependencies

- **Requires:** `database-schema-migrations` plan (posts, post_feedback tables)
- **Requires:** `auth-system` plan (JWT verification)
- **Requires:** `classification-system` plan (posts must exist to give feedback on)

---

## What's NOT included

- No feedback retrieval/analysis endpoints
- No feedback-based model improvement
- No feedback aggregation UI
- No feedback export functionality
