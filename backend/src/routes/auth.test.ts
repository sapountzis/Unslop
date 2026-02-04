// Tests for auth endpoints
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { db } from '../db';
import { users } from '../db/schema';
import { eq } from 'drizzle-orm';
import {
  generateMagicLinkToken,
  generateSessionToken,
  verifySessionToken,
} from '../lib/jwt';

// Mock the email sending utility
const mockSendMagicLinkEmail = async (email: string, token: string) => {
  // Mock implementation - do nothing
};

const API_URL = process.env.APP_URL || 'http://localhost:3000';

describe('POST /v1/auth/start', () => {
  beforeEach(async () => {
    // Clean up test users
    await db.delete(users).where(eq(users.email, 'test@example.com'));
    await db.delete(users).where(eq(users.email, 'test@example.org'));
  });

  afterEach(async () => {
    // Clean up test users
    await db.delete(users).where(eq(users.email, 'test@example.com'));
    await db.delete(users).where(eq(users.email, 'test@example.org'));
  });

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
  beforeEach(async () => {
    // Clean up test users
    await db.delete(users).where(eq(users.email, 'callback-test@example.com'));
  });

  afterEach(async () => {
    // Clean up test users
    await db.delete(users).where(eq(users.email, 'callback-test@example.com'));
  });

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

    const token = await generateMagicLinkToken(newUser[0].id);

    const res = await fetch(`${API_URL}/v1/auth/callback?token=${token}`);
    expect(res.status).toBe(200);

    const html = await res.text();
    expect(html).toContain('<meta name="unslop-jwt" content="');
    expect(html).toContain('UNSLOP_AUTH_SUCCESS');
  });

  it('should reject invalid token', async () => {
    const res = await fetch(
      `${API_URL}/v1/auth/callback?token=invalid-token`
    );
    expect(res.status).toBe(400);
  });
});

describe('GET /v1/me', () => {
  beforeEach(async () => {
    // Clean up test users
    await db.delete(users).where(eq(users.email, 'me-test@example.com'));
  });

  afterEach(async () => {
    // Clean up test users
    await db.delete(users).where(eq(users.email, 'me-test@example.com'));
  });

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
    const res = await fetch(`${API_URL}/v1/me`, {
      headers: { Authorization: 'Bearer invalid-token' },
    });
    expect(res.status).toBe(401);
  });

  it('should handle missing user gracefully', async () => {
    // Create a token for a non-existent user
    const fakeUserId = '00000000-0000-0000-0000-000000000000';
    const token = await generateSessionToken(fakeUserId, 'nonexistent@example.com');

    const res = await fetch(`${API_URL}/v1/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(404);
  });
});
