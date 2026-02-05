import { describe, expect, it, mock } from 'bun:test';
import { createTestApp } from '../test-utils/app';
import { generateSessionToken, verifySessionToken } from '../lib/jwt';
import { createAuthMiddleware } from '../middleware/auth';
import { createAuthRoutes } from './auth';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key';

const startAuthMock = mock(async () => undefined);
const completeMagicLinkMock = mock(async (token: string) => {
  if (token === 'valid-token') {
    return { sessionToken: 'session-jwt-token' };
  }
  throw new Error('invalid token');
});

const authService = {
  startAuth: startAuthMock,
  completeMagicLink: completeMagicLinkMock,
  getCurrentUser: mock(async (userId: string) => ({
    id: userId,
    email: 'callback-test@example.com',
    plan: 'free',
    planStatus: 'inactive',
  })),
};

const app = createTestApp((testApp) => {
  testApp.route(
    '/',
    createAuthRoutes({
      authMiddleware: createAuthMiddleware({ verifySessionToken }),
      authService,
      logger: {
        error: mock(() => undefined),
      },
    }),
  );
});

describe('Auth Routes (unit)', () => {
  it('POST /v1/auth/start accepts valid email and delegates to service', async () => {
    const res = await app.request('http://localhost/v1/auth/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'TEST@Example.com' }),
    });

    expect(res.status).toBe(202);
    expect(startAuthMock).toHaveBeenCalledWith('TEST@Example.com');
  });

  it('POST /v1/auth/start remains idempotent under concurrent requests', async () => {
    const requests = Array.from({ length: 8 }, (_, index) => {
      const email = index % 2 === 0 ? 'RACE@Test.com' : 'race@test.com';
      return app.request('http://localhost/v1/auth/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
    });

    const responses = await Promise.all(requests);
    for (const response of responses) {
      expect(response.status).toBe(202);
    }

    expect(startAuthMock).toHaveBeenCalledTimes(9);
  });

  it('POST /v1/auth/start rejects invalid email', async () => {
    const res = await app.request('http://localhost/v1/auth/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'not-an-email' }),
    });

    expect(res.status).toBe(400);
  });

  it('GET /v1/auth/callback rejects missing token', async () => {
    const res = await app.request('http://localhost/v1/auth/callback');

    expect(res.status).toBe(400);
    expect(await res.text()).toContain('No token provided');
  });

  it('GET /v1/auth/callback renders jwt meta and no wildcard postMessage', async () => {
    const res = await app.request('http://localhost/v1/auth/callback?token=valid-token');

    expect(res.status).toBe(200);
    const html = await res.text();

    expect(html).toContain('<meta name="unslop-jwt" content="session-jwt-token">');
    expect(html).not.toContain("postMessage({ type: 'UNSLOP_AUTH_SUCCESS'");
    expect(html).not.toContain(", '*')");

    expect(res.headers.get('Cache-Control')).toContain('no-store');
    expect(res.headers.get('Pragma')).toBe('no-cache');
  });

  it('GET /v1/me rejects unauthenticated request', async () => {
    const res = await app.request('http://localhost/v1/me');

    expect(res.status).toBe(401);
  });

  it('GET /v1/me returns user payload when authenticated', async () => {
    const token = await generateSessionToken('test-user-id', 'user@example.com');
    const res = await app.request('http://localhost/v1/me', {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      user_id: 'test-user-id',
      email: 'callback-test@example.com',
      plan: 'free',
      plan_status: 'inactive',
    });
  });
});
