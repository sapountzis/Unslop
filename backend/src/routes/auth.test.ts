import { describe, expect, it, mock } from 'bun:test';
import { createTestApp } from '../test-utils/app';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key';

const dbChain = {
  select: mock(() => dbChain),
  from: mock(() => dbChain),
  where: mock(() => dbChain),
  limit: mock(async () => [
    {
      id: 'test-user-id',
      email: 'callback-test@example.com',
      plan: 'free',
      planStatus: 'inactive',
    },
  ]),
  insert: mock(() => dbChain),
  values: mock(() => ({ returning: mock(async () => [{ id: 'test-user-id' }]) })),
};

const verifyMagicLinkTokenMock = mock(async (token: string) => {
  if (token === 'valid-token') {
    return { userId: 'test-user-id' };
  }

  throw new Error('invalid token');
});

mock.module('../db', () => ({
  db: dbChain,
}));

mock.module('../lib/email', () => ({
  sendMagicLinkEmail: mock(async () => undefined),
}));

mock.module('../lib/jwt', () => ({
  generateMagicLinkToken: mock(async () => 'magic-link-token'),
  generateSessionToken: mock(async () => 'session-jwt-token'),
  verifyMagicLinkToken: verifyMagicLinkTokenMock,
  verifySessionToken: mock(async () => ({
    sub: 'test-user-id',
    email: 'test@example.com',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 60,
  })),
}));

const { auth } = await import('./auth');

const app = createTestApp((testApp) => {
  testApp.route('/', auth);
});

describe('Auth Routes (unit)', () => {
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
});
