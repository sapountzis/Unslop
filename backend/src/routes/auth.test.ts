// Integration tests for auth endpoints - requires running server
// Run with: bun run dev & bun test src/routes/auth.test.ts
import 'dotenv/config';

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { db } from '../db';
import { users } from '../db/schema';
import { eq } from 'drizzle-orm';
import { generateMagicLinkToken, generateSessionToken } from '../lib/jwt';

const API_URL = process.env.APP_URL;

async function isServerRunning(): Promise<boolean> {
  try {
    await fetch(`${API_URL}/health`, { signal: AbortSignal.timeout(500) });
    return true;
  } catch {
    return false;
  }
}

const skipIfNoServer = async () => {
  if (!(await isServerRunning())) {
    console.log('⚠️  Skipping - server not running');
    return true;
  }
  return false;
};

describe('POST /v1/auth/start', () => {
  beforeEach(async () => {
    if (await isServerRunning()) {
      await db.delete(users).where(eq(users.email, 'test@example.com'));
      await db.delete(users).where(eq(users.email, 'test@example.org'));
    }
  });

  afterEach(async () => {
    if (await isServerRunning()) {
      await db.delete(users).where(eq(users.email, 'test@example.com'));
      await db.delete(users).where(eq(users.email, 'test@example.org'));
    }
  });

  it('should accept valid email', async () => {
    if (await skipIfNoServer()) return;

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
    if (await skipIfNoServer()) return;

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
    if (await skipIfNoServer()) return;

    const res = await fetch(`${API_URL}/v1/auth/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'not-an-email' }),
    });

    expect(res.status).toBe(400);
  });
});

describe('GET /v1/auth/callback', () => {
  beforeEach(async () => {
    if (await isServerRunning()) {
      await db.delete(users).where(eq(users.email, 'callback-test@example.com'));
    }
  });

  afterEach(async () => {
    if (await isServerRunning()) {
      await db.delete(users).where(eq(users.email, 'callback-test@example.com'));
    }
  });

  it('should reject missing token', async () => {
    if (await skipIfNoServer()) return;

    const res = await fetch(`${API_URL}/v1/auth/callback`);
    expect(res.status).toBe(400);
  });

  it('should accept valid token and return JWT', async () => {
    if (await skipIfNoServer()) return;

    const newUser = await db
      .insert(users)
      .values({ email: 'callback-test@example.com', plan: 'free', planStatus: 'inactive' })
      .returning();

    const token = await generateMagicLinkToken(newUser[0].id);
    const res = await fetch(`${API_URL}/v1/auth/callback?token=${token}`);

    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('<meta name="unslop-jwt" content="');
  });

  it('should reject invalid token', async () => {
    if (await skipIfNoServer()) return;

    const res = await fetch(`${API_URL}/v1/auth/callback?token=invalid-token`);
    expect(res.status).toBe(400);
  });
});

describe('GET /v1/me', () => {
  beforeEach(async () => {
    if (await isServerRunning()) {
      await db.delete(users).where(eq(users.email, 'me-test@example.com'));
    }
  });

  afterEach(async () => {
    if (await isServerRunning()) {
      await db.delete(users).where(eq(users.email, 'me-test@example.com'));
    }
  });

  it('should reject unauthenticated request', async () => {
    if (await skipIfNoServer()) return;

    const res = await fetch(`${API_URL}/v1/me`);
    expect(res.status).toBe(401);
  });

  it('should return user info for authenticated request', async () => {
    if (await skipIfNoServer()) return;

    const newUser = await db
      .insert(users)
      .values({ email: 'me-test@example.com', plan: 'free', planStatus: 'inactive' })
      .returning();

    const token = await generateSessionToken(newUser[0].id, newUser[0].email);
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

  it('should reject invalid token', async () => {
    if (await skipIfNoServer()) return;

    const res = await fetch(`${API_URL}/v1/me`, {
      headers: { Authorization: 'Bearer invalid-token' },
    });
    expect(res.status).toBe(401);
  });

  it('should handle missing user gracefully', async () => {
    if (await skipIfNoServer()) return;

    const token = await generateSessionToken('00000000-0000-0000-0000-000000000000', 'nonexistent@example.com');
    const res = await fetch(`${API_URL}/v1/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(404);
  });
});
