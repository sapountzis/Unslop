# Billing System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement Polar checkout integration and webhook handling for Pro subscriptions.

**Architecture:** Checkout creation endpoint + webhook handler that updates user plan status.

**Tech Stack:** Hono, Polar SDK, Drizzle ORM, PostgreSQL

---

## Task 1: Create Polar service module

**Files:**
- Create: `backend/src/services/polar.ts`

**Step 1: Write Polar service**

```typescript
// backend/src/services/polar.ts
import { db } from '../db';
import { users } from '../db/schema';
import { eq } from 'drizzle-orm';

const POLAR_API_KEY = process.env.POLAR_API_KEY!;
const POLAR_WEBHOOK_SECRET = process.env.POLAR_WEBHOOK_SECRET!;

const POLAR_API_BASE = 'https://api.polar.sh';

if (!POLAR_API_KEY) {
  throw new Error('POLAR_API_KEY environment variable is required');
}
if (!POLAR_WEBHOOK_SECRET) {
  throw new Error('POLAR_WEBHOOK_SECRET environment variable is required');
}

export interface CheckoutSession {
  checkout_url: string;
}

export async function createCheckoutSession(userId: string): Promise<CheckoutSession> {
  // Get current user to check if already Pro
  const userRecords = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (userRecords.length === 0) {
    throw new Error('User not found');
  }

  const user = userRecords[0];

  // Check if already active Pro
  if (user.plan === 'pro' && user.planStatus === 'active') {
    throw new Error('ALREADY_PRO');
  }

  // Create Polar checkout
  const response = await fetch(`${POLAR_API_BASE}/v1/checkouts`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${POLAR_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      product_price_id: process.env.POLAR_PRO_MONTHLY_PRICE_ID!,
      success_url: 'https://unslop.xyz/billing/success',
      cancel_url: 'https://unslop.xyz/billing/cancel',
      customer_email: user.email,
      metadata: {
        user_id: userId,
      },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Polar API error: ${response.status} ${error}`);
  }

  const data = await response.json();

  return {
    checkout_url: data.url,
  };
}

export interface PolarWebhookPayload {
  type: string;
  data: {
    id: string;
    customer_id?: string;
    subscription_id?: string;
    metadata?: Record<string, unknown>;
    status?: string;
  };
}

export async function verifyWebhookSignature(
  payload: string,
  signature: string
): boolean {
  const crypto = await import('crypto');

  const hmac = crypto.createHmac('sha256', POLAR_WEBHOOK_SECRET);
  hmac.update(payload);
  const digest = hmac.digest('hex');

  // Polar uses a specific signature format
  const expectedSignature = `sha256=${digest}`;

  return signature === expectedSignature;
}

export async function handleSubscriptionWebhook(payload: PolarWebhookPayload): Promise<void> {
  const { type, data } = payload;

  // Extract user_id from metadata
  const userId = data.metadata?.user_id as string | undefined;

  if (!userId) {
    console.error('Webhook missing user_id in metadata');
    return;
  }

  switch (type) {
    case 'subscription.created':
    case 'subscription.activated':
    case 'subscription.renewed':
      // Set to Pro active
      await db
        .update(users)
        .set({
          plan: 'pro',
          planStatus: 'active',
          polarCustomerId: data.customer_id,
          polarSubscriptionId: data.subscription_id,
        })
        .where(eq(users.id, userId));
      break;

    case 'subscription.cancelled':
    case 'subscription.expired':
      // Set to inactive
      await db
        .update(users)
        .set({
          planStatus: 'inactive',
        })
        .where(eq(users.id, userId));
      break;

    default:
      console.log(`Unhandled webhook type: ${type}`);
  }
}
```

**Step 2: Add environment variable to .env.example**

```bash
# Add to backend/.env.example (create if doesn't exist)
POLAR_API_KEY=
POLAR_WEBHOOK_SECRET=
POLAR_PRO_MONTHLY_PRICE_ID=
```

**Step 3: Run type check**

Run: `cd backend && bun run tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add backend/src/services/polar.ts backend/.env.example
git commit -m "feat: add Polar service for billing"
```

---

## Task 2: Implement POST /v1/billing/create-checkout

**Files:**
- Create: `backend/src/routes/billing.ts`

**Step 1: Write billing endpoints**

```typescript
// backend/src/routes/billing.ts
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { createCheckoutSession, handleSubscriptionWebhook, verifyWebhookSignature } from '../services/polar';

const billing = new Hono();

const checkoutSchema = z.object({
  plan: z.enum(['pro-monthly']),
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

// POST /v1/billing/create-checkout
billing.post('/v1/billing/create-checkout', authMiddleware, zValidator('json', checkoutSchema), async (c) => {
  const user = c.get('user');

  try {
    const session = await createCheckoutSession(user.sub);
    return c.json({ checkout_url: session.checkout_url });
  } catch (err: any) {
    if (err.message === 'ALREADY_PRO') {
      return c.json({ error: 'already_pro' }, 409);
    }
    console.error('Checkout creation failed:', err);
    return c.json({ error: 'checkout_failed' }, 500);
  }
});

// POST /v1/billing/polar/webhook
billing.post('/v1/billing/polar/webhook', async (c) => {
  // Get raw body for signature verification
  const rawBody = await c.req.text();
  const signature = c.req.header('x-polar-signature') || '';

  // Verify signature
  const isValid = await verifyWebhookSignature(rawBody, signature);

  if (!isValid) {
    return c.json({ error: 'invalid_signature' }, 401);
  }

  try {
    const payload = JSON.parse(rawBody);
    await handleSubscriptionWebhook(payload);
    return c.json({ received: true });
  } catch (err) {
    console.error('Webhook handling failed:', err);
    // Still return 200 so Polar doesn't retry
    return c.json({ received: true, error: 'processing_failed' });
  }
});

export { billing };
```

**Step 2: Mount the route in index.ts**

```typescript
// Add to backend/src/index.ts
import { billing } from './routes/billing';

// Mount billing routes
app.route('/', billing);
```

**Step 3: Run type check**

Run: `cd backend && bun run tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add backend/src/routes/billing.ts backend/src/index.ts
git commit -m "feat: implement billing endpoints"
```

---

## Task 3: Create tests for billing endpoints

**Files:**
- Create: `backend/src/routes/billing.test.ts`

**Step 1: Write tests**

```typescript
// backend/src/routes/billing.test.ts
import { describe, it, expect, beforeEach, mock } from 'bun:test';
import { db } from '../db';
import { users } from '../db/schema';
import { eq } from 'drizzle-orm';
import { generateSessionToken } from '../lib/jwt';

const API_URL = 'http://localhost:3000';

async function createTestUser(plan: string = 'free', planStatus: string = 'inactive') {
  const user = await db
    .insert(users)
    .values({
      email: `test-${Date.now()}@example.com`,
      plan,
      planStatus,
    })
    .returning();

  return user[0];
}

async function getAuthToken(userId: string, email: string): Promise<string> {
  return generateSessionToken(userId, email);
}

describe('POST /v1/billing/create-checkout', () => {
  it('should reject unauthenticated requests', async () => {
    const res = await fetch(`${API_URL}/v1/billing/create-checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan: 'pro-monthly' }),
    });

    expect(res.status).toBe(401);
  });

  it('should create checkout for free user', async () => {
    const user = await createTestUser();
    const token = await getAuthToken(user.id, user.email);

    // Mock Polar API
    mock.module('src/services/polar', () => ({
      createCheckoutSession: async () => ({
        checkout_url: 'https://polar.sh/checkout/test',
      }),
    }));

    const res = await fetch(`${API_URL}/v1/billing/create-checkout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ plan: 'pro-monthly' }),
    });

    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.checkout_url).toBeTruthy();
  });

  it('should return 409 for already pro user', async () => {
    const user = await createTestUser('pro', 'active');
    const token = await getAuthToken(user.id, user.email);

    const res = await fetch(`${API_URL}/v1/billing/create-checkout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ plan: 'pro-monthly' }),
    });

    expect(res.status).toBe(409);

    const data = await res.json();
    expect(data.error).toBe('already_pro');
  });

  it('should reject invalid plan', async () => {
    const user = await createTestUser();
    const token = await getAuthToken(user.id, user.email);

    const res = await fetch(`${API_URL}/v1/billing/create-checkout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ plan: 'invalid-plan' }),
    });

    expect(res.status).toBe(400);
  });
});

describe('POST /v1/billing/polar/webhook', () => {
  it('should reject invalid signature', async () => {
    const res = await fetch(`${API_URL}/v1/billing/polar/webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-polar-signature': 'invalid-signature',
      },
      body: JSON.stringify({ type: 'test', data: {} }),
    });

    expect(res.status).toBe(401);
  });

  it('should accept valid webhook and update user', async () => {
    const user = await createTestUser();

    const webhookPayload = {
      type: 'subscription.activated',
      data: {
        id: 'sub_123',
        customer_id: 'cust_123',
        subscription_id: 'sub_123',
        metadata: { user_id: user.id },
      },
    };

    // Mock signature verification
    const crypto = await import('crypto');
    const POLAR_WEBHOOK_SECRET = process.env.POLAR_WEBHOOK_SECRET || 'test-secret';
    const hmac = crypto.createHmac('sha256', POLAR_WEBHOOK_SECRET);
    hmac.update(JSON.stringify(webhookPayload));
    const signature = `sha256=${hmac.digest('hex')}`;

    const res = await fetch(`${API_URL}/v1/billing/polar/webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-polar-signature': signature,
      },
      body: JSON.stringify(webhookPayload),
    });

    expect(res.status).toBe(200);

    // Verify user was updated
    const updated = await db
      .select()
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);

    expect(updated[0].plan).toBe('pro');
    expect(updated[0].planStatus).toBe('active');
    expect(updated[0].polarCustomerId).toBe('cust_123');
    expect(updated[0].polarSubscriptionId).toBe('sub_123');
  });

  it('should handle subscription cancelled webhook', async () => {
    const user = await createTestUser('pro', 'active');

    const webhookPayload = {
      type: 'subscription.cancelled',
      data: {
        id: 'sub_123',
        metadata: { user_id: user.id },
      },
    };

    const crypto = await import('crypto');
    const POLAR_WEBHOOK_SECRET = process.env.POLAR_WEBHOOK_SECRET || 'test-secret';
    const hmac = crypto.createHmac('sha256', POLAR_WEBHOOK_SECRET);
    hmac.update(JSON.stringify(webhookPayload));
    const signature = `sha256=${hmac.digest('hex')}`;

    await fetch(`${API_URL}/v1/billing/polar/webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-polar-signature': signature,
      },
      body: JSON.stringify(webhookPayload),
    });

    // Verify user was updated to inactive
    const updated = await db
      .select()
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);

    expect(updated[0].plan).toBe('pro');
    expect(updated[0].planStatus).toBe('inactive');
  });
});
```

**Step 2: Run tests**

Run: `cd backend && bun test`
Expected: All tests pass

**Step 3: Commit**

```bash
git add backend/src/routes/billing.test.ts
git commit -m "test: add billing endpoint tests"
```

---

## Dependencies

- **Requires:** `database-schema-migrations` plan (users table with plan fields)
- **Requires:** `auth-system` plan (JWT verification)

---

## What's NOT included

- No Polar customer portal link
- No proration handling
- No plan upgrades/downgrades UI
- No annual billing option
- No metered billing
