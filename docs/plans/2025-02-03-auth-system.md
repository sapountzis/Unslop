# Auth System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement email magic-link authentication with JWT session tokens.

**Architecture:** Hono endpoints for auth start/callback, JWT generation/validation, simple email sending via Resend.

**Tech Stack:** Hono, Bun, JWT (jsonwebtoken), Resend (email), PostgreSQL via Drizzle

---

## Task 1: Set up Hono app and middleware structure

**Files:**
- Create: `backend/src/index.ts`
- Create: `backend/src/middleware/auth.ts`

**Step 1: Create base Hono app**

```typescript
// backend/src/index.ts
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';

const app = new Hono();

app.use('*', cors());

app.get('/', (c) => c.text('Unslop API v0.1'));

const port = parseInt(process.env.PORT || '3000');

serve({
  fetch: app.fetch,
  port,
});

console.log(`Server running on port ${port}`);
```

**Step 2: Install dependencies**

Run: `cd backend && bun add @hono/node-server`

**Step 3: Test the server**

Run: `cd backend && bun run dev`
Expected: Server starts on port 3000

**Step 4: Verify with curl**

Run: `curl http://localhost:3000/`
Expected: `Unslop API v0.1`

**Step 5: Stop server and commit**

```bash
git add backend/src/index.ts backend/package.json
git commit -m "feat: initialize Hono server"
```

---

## Task 2: Create JWT utility functions

**Files:**
- Create: `backend/src/lib/jwt.ts`

**Step 1: Write JWT utilities**

```typescript
// backend/src/lib/jwt.ts
import { sign, verify } from 'jsonwebtoken';

export interface JWTPayload {
  sub: string; // user_id
  email: string;
  iat: number;
  exp: number;
}

const JWT_SECRET = process.env.JWT_SECRET!;
const JWT_EXPIRY_DAYS = 60;

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}

export function generateSessionToken(userId: string, email: string): string {
  const now = Math.floor(Date.now() / 1000);

  const payload: JWTPayload = {
    sub: userId,
    email,
    iat: now,
    exp: now + JWT_EXPIRY_DAYS * 24 * 60 * 60,
  };

  return sign(payload, JWT_SECRET);
}

export function verifySessionToken(token: string): JWTPayload {
  return verify(token, JWT_SECRET) as JWTPayload;
}

export function generateMagicLinkToken(userId: string): string {
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + 15 * 60; // 15 minutes

  const payload = {
    sub: userId,
    iat: now,
    exp: expiresAt,
    purpose: 'magic_link',
  };

  return sign(payload, process.env.MAGIC_LINK_SECRET!);
}

export function verifyMagicLinkToken(token: string): { userId: string } {
  const payload = verify(token, process.env.MAGIC_LINK_SECRET!) as {
    sub: string;
    purpose?: string;
  };

  if (payload.purpose !== 'magic_link') {
    throw new Error('Invalid token purpose');
  }

  return { userId: payload.sub };
}
```

**Step 2: Install dependencies**

Run: `cd backend && bun add jsonwebtoken && bun add -d @types/jsonwebtoken`

**Step 3: Run type check**

Run: `cd backend && bun run tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add backend/src/lib/jwt.ts backend/package.json
git commit -m "feat: add JWT utility functions"
```

---

## Task 3: Create email sending utility

**Files:**
- Create: `backend/src/lib/email.ts`

**Step 1: Write email utility**

```typescript
// backend/src/lib/email.ts
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY!);

const MAGIC_LINK_BASE_URL = process.env.MAGIC_LINK_BASE_URL!;

if (!MAGIC_LINK_BASE_URL) {
  throw new Error('MAGIC_LINK_BASE_URL environment variable is required');
}

export async function sendMagicLinkEmail(email: string, token: string): Promise<void> {
  const link = `${MAGIC_LINK_BASE_URL}?token=${encodeURIComponent(token)}`;

  await resend.emails.send({
    from: 'Unslop <noreply@unslop.xyz>',
    to: email,
    subject: 'Sign in to Unslop',
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: system-ui, -apple-system, sans-serif; line-height: 1.5; }
            a { color: #0066cc; }
            .button { display: inline-block; padding: 12px 24px; background: #0066cc; color: white; text-decoration: none; border-radius: 6px; }
          </style>
        </head>
        <body>
          <h2>Sign in to Unslop</h2>
          <p>Click the button below to sign in to your account:</p>
          <p><a href="${link}" class="button">Sign In</a></p>
          <p>Or copy this link:<br><a href="${link}">${link}</a></p>
          <p>This link expires in 15 minutes.</p>
        </body>
      </html>
    `,
  });
}
```

**Step 2: Install Resend**

Run: `cd backend && bun add resend`

**Step 3: Run type check**

Run: `cd backend && bun run tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add backend/src/lib/email.ts backend/package.json
git commit -m "feat: add email sending utility with Resend"
```

---

## Task 4: Create auth middleware

**Files:**
- Create: `backend/src/middleware/auth.ts`

**Step 1: Write auth middleware**

```typescript
// backend/src/middleware/auth.ts
import { MiddlewareHandler } from 'hono';
import { verifySessionToken, type JWTPayload } from '../lib/jwt';

export const authMiddleware: MiddlewareHandler = async (c, next) => {
  const authHeader = c.req.header('Authorization');

  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const token = authHeader.substring(7);

  try {
    const payload = verifySessionToken(token);
    c.set('user', payload);
    await next();
  } catch (err) {
    return c.json({ error: 'Invalid token' }, 401);
  }
};

declare module 'hono' {
  interface ContextVariableMap {
    user: JWTPayload;
  }
}
```

**Step 2: Run type check**

Run: `cd backend && bun run tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add backend/src/middleware/auth.ts
git commit -m "feat: add JWT auth middleware"
```

---

## Task 5: Implement POST /v1/auth/start

**Files:**
- Modify: `backend/src/index.ts`
- Create: `backend/src/routes/auth.ts`

**Step 1: Create auth routes module**

```typescript
// backend/src/routes/auth.ts
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { db } from '../db';
import { users } from '../db/schema';
import { eq } from 'drizzle-orm';
import { generateMagicLinkToken, generateSessionToken } from '../lib/jwt';
import { sendMagicLinkEmail } from '../lib/email';

const auth = new Hono();

const startAuthSchema = z.object({
  email: z.string().email(),
});

// POST /v1/auth/start
auth.post('/start', zValidator('json', startAuthSchema), async (c) => {
  const { email } = c.req.valid('json');

  // Normalize email
  const normalizedEmail = email.toLowerCase().trim();

  // Upsert user
  const existingUser = await db
    .select()
    .from(users)
    .where(eq(users.email, normalizedEmail))
    .limit(1);

  let userId: string;

  if (existingUser.length > 0) {
    userId = existingUser[0].id;
  } else {
    const newUser = await db
      .insert(users)
      .values({
        email: normalizedEmail,
        plan: 'free',
        planStatus: 'inactive',
      })
      .returning();

    userId = newUser[0].id;
  }

  // Generate magic link token
  const token = generateMagicLinkToken(userId);

  // Send email
  await sendMagicLinkEmail(normalizedEmail, token);

  return c.json({ status: 'accepted' }, 202);
});

// GET /v1/auth/callback
auth.get('/callback', async (c) => {
  const token = c.req.query('token');

  if (!token) {
    return c.html(
      `<html>
        <body><h1>Invalid callback</h1><p>No token provided.</p></body>
      </html>`,
      400
    );
  }

  try {
    const { userId } = await import('../lib/jwt').then(m =>
      m.verifyMagicLinkToken(token)
    );

    // Get user email
    const userRecords = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (userRecords.length === 0) {
      throw new Error('User not found');
    }

    const user = userRecords[0];

    // Generate session JWT
    const sessionToken = generateSessionToken(user.id, user.email);

    return c.html(
      `<!DOCTYPE html>
      <html>
        <head>
          <title>Sign In - Unslop</title>
          <meta name="unslop-jwt" content="${sessionToken}">
        </head>
        <body>
          <h1>Sign in successful</h1>
          <p>You can close this tab and return to the extension.</p>
          <script>
            // Send token to extension via postMessage (for content script)
            if (window.opener) {
              window.opener.postMessage({ type: 'UNSLOP_AUTH_SUCCESS', token: '${sessionToken}' }, '*');
            }
          </script>
        </body>
      </html>`
    );
  } catch (err) {
    return c.html(
      `<html>
        <body><h1>Invalid or expired link</h1><p>Please try again.</p></body>
      </html>`,
      400
    );
  }
});

// GET /v1/me
auth.get('/me', authMiddleware, async (c) => {
  const user = c.get('user');

  // Get fresh user data from DB
  const userRecords = await db
    .select()
    .from(users)
    .where(eq(users.id, user.sub))
    .limit(1);

  if (userRecords.length === 0) {
    return c.json({ error: 'User not found' }, 404);
  }

  const userData = userRecords[0];

  return c.json({
    user_id: userData.id,
    email: userData.email,
    plan: userData.plan,
    plan_status: userData.planStatus,
  });
});

export { auth };
```

**Step 2: Update index.ts to mount auth routes**

```typescript
// Add to backend/src/index.ts
import { auth } from './routes/auth';
import { authMiddleware } from './middleware/auth';

// Mount auth routes
app.route('/v1/auth', auth);
app.route('/v1/me', auth); // This will need adjustment - see below
```

Wait, let me fix the /v1/me route. The middleware needs to be applied differently:

```typescript
// Actually, let's use a different approach for /v1/me
// Update backend/src/index.ts to:
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { cors } from 'hono/cors';
import { auth } from './routes/auth';

const app = new Hono();

app.use('*', cors());

// Mount auth routes (includes /v1/me internally)
app.route('/', auth);

app.get('/', (c) => c.text('Unslop API v0.1'));

const port = parseInt(process.env.PORT || '3000');

serve({
  fetch: app.fetch,
  port,
});

console.log(`Server running on port ${port}`);
```

And update the auth routes to handle the path correctly:

```typescript
// Update backend/src/routes/auth.ts
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { db } from '../db';
import { users } from '../db/schema';
import { eq } from 'drizzle-orm';
import { generateMagicLinkToken, generateSessionToken, verifyMagicLinkToken } from '../lib/jwt';
import { sendMagicLinkEmail } from '../lib/email';

const auth = new Hono();

const startAuthSchema = z.object({
  email: z.string().email(),
});

// POST /v1/auth/start
auth.post('/v1/auth/start', zValidator('json', startAuthSchema), async (c) => {
  const { email } = c.req.valid('json');
  const normalizedEmail = email.toLowerCase().trim();

  const existingUser = await db
    .select()
    .from(users)
    .where(eq(users.email, normalizedEmail))
    .limit(1);

  let userId: string;

  if (existingUser.length > 0) {
    userId = existingUser[0].id;
  } else {
    const newUser = await db
      .insert(users)
      .values({
        email: normalizedEmail,
        plan: 'free',
        planStatus: 'inactive',
      })
      .returning();

    userId = newUser[0].id;
  }

  const token = generateMagicLinkToken(userId);
  await sendMagicLinkEmail(normalizedEmail, token);

  return c.json({ status: 'accepted' }, 202);
});

// GET /v1/auth/callback
auth.get('/v1/auth/callback', async (c) => {
  const token = c.req.query('token');

  if (!token) {
    return c.html(
      `<html><body><h1>Invalid callback</h1><p>No token provided.</p></body></html>`,
      400
    );
  }

  try {
    const { userId } = verifyMagicLinkToken(token);

    const userRecords = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (userRecords.length === 0) {
      throw new Error('User not found');
    }

    const user = userRecords[0];
    const sessionToken = generateSessionToken(user.id, user.email);

    return c.html(
      `<!DOCTYPE html>
      <html>
        <head>
          <title>Sign In - Unslop</title>
          <meta name="unslop-jwt" content="${sessionToken}">
        </head>
        <body>
          <h1>Sign in successful</h1>
          <p>You can close this tab and return to the extension.</p>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'UNSLOP_AUTH_SUCCESS', token: '${sessionToken}' }, '*');
            }
          </script>
        </body>
      </html>`
    );
  } catch (err) {
    return c.html(
      `<html><body><h1>Invalid or expired link</h1><p>Please try again.</p></body></html>`,
      400
    );
  }
});

// Auth middleware for protected routes
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

// GET /v1/me
auth.get('/v1/me', authMiddleware, async (c) => {
  const user = c.get('user');

  const userRecords = await db
    .select()
    .from(users)
    .where(eq(users.id, user.sub))
    .limit(1);

  if (userRecords.length === 0) {
    return c.json({ error: 'User not found' }, 404);
  }

  const userData = userRecords[0];

  return c.json({
    user_id: userData.id,
    email: userData.email,
    plan: userData.plan,
    plan_status: userData.planStatus,
  });
});

export { auth };
```

**Step 3: Run type check**

Run: `cd backend && bun run tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add backend/src/routes/auth.ts backend/src/index.ts
git commit -m "feat: implement auth endpoints (start, callback, me)"
```

---

## Task 6: Add validation for auth request bodies

**Files:**
- Modify: `backend/src/routes/auth.ts`

**Step 1: Add input validation with zod**

```typescript
// Already done in Task 5 - zValidator is used
// This is just verification
```

**Step 2: Test validation with invalid input**

Run: `curl -X POST http://localhost:3000/v1/auth/start -H "Content-Type: application/json" -d '{"email": "not-an-email"}'`
Expected: `400 Bad Request` with validation error

**Step 3: Test validation with valid input**

Run: `curl -X POST http://localhost:3000/v1/auth/start -H "Content-Type: application/json" -d '{"email": "test@example.com"}'`
Expected: `202 Accepted` with `{"status":"accepted"}`

**Step 4: Commit (if any changes needed)**

---

## Task 7: Create tests for auth endpoints

**Files:**
- Create: `backend/src/routes/auth.test.ts`

**Step 1: Write tests**

```typescript
// backend/src/routes/auth.test.ts
import { describe, it, expect, beforeAll, beforeEach } from 'bun:test';
import { db } from '../db';
import { users } from '../db/schema';
import { eq } from 'drizzle-orm';
import { generateMagicLinkToken, verifySessionToken } from '../lib/jwt';

const API_URL = 'http://localhost:3000';

describe('POST /v1/auth/start', () => {
  it('should accept valid email', async () => {
    const res = await fetch(`${API_URL}/v1/auth/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'test@example.com' }),
    });

    expect(res.status).toBe(202);
    const data = await res.json();
    expect(data).toEqual({ status: 'accepted' });
  });

  it('should normalize email to lowercase', async () => {
    await fetch(`${API_URL}/v1/auth/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'TEST@Example.COM' }),
    });

    const user = await db
      .select()
      .from(users)
      .where(eq(users.email, 'test@example.com'))
      .limit(1);

    expect(user.length).toBe(1);
  });

  it('should reject invalid email', async () => {
    const res = await fetch(`${API_URL}/v1/auth/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'not-an-email' }),
    });

    expect(res.status).toBe(400);
  });
});

describe('GET /v1/auth/callback', () => {
  it('should reject missing token', async () => {
    const res = await fetch(`${API_URL}/v1/auth/callback`);
    expect(res.status).toBe(400);
  });

  it('should accept valid token and return JWT', async () => {
    // First create a user
    const newUser = await db
      .insert(users)
      .values({
        email: 'callback-test@example.com',
        plan: 'free',
        planStatus: 'inactive',
      })
      .returning();

    const token = generateMagicLinkToken(newUser[0].id);

    const res = await fetch(`${API_URL}/v1/auth/callback?token=${token}`);
    expect(res.status).toBe(200);

    const html = await res.text();
    expect(html).toContain('<meta name="unslop-jwt" content="');
  });
});

describe('GET /v1/me', () => {
  it('should reject unauthenticated request', async () => {
    const res = await fetch(`${API_URL}/v1/me`);
    expect(res.status).toBe(401);
  });

  it('should return user info for authenticated request', async () => {
    // Create a user
    const newUser = await db
      .insert(users)
      .values({
        email: 'me-test@example.com',
        plan: 'free',
        planStatus: 'inactive',
      })
      .returning();

    const token = await import('../lib/jwt').then(m =>
      m.generateSessionToken(newUser[0].id, newUser[0].email)
    );

    const res = await fetch(`${API_URL}/v1/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data).toEqual({
      user_id: newUser[0].id,
      email: 'me-test@example.com',
      plan: 'free',
      plan_status: 'inactive',
    });
  });
});
```

**Step 2: Run tests**

Run: `cd backend && bun test`
Expected: All tests pass

**Step 3: Commit**

```bash
git add backend/src/routes/auth.test.ts
git commit -m "test: add auth endpoint tests"
```

---

## Dependencies

- **Requires:** `database-schema-migrations` plan (users table must exist)

---

## What's NOT included

- No billing integration (user.plan is read-only here)
- No rate limiting on auth/start
- No refresh token flow
- No password reset (magic links only)
