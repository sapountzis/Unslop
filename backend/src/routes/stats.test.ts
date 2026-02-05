import { beforeEach, describe, expect, it, mock } from 'bun:test';
import { createTestApp } from '../test-utils/app';
import { generateSessionToken } from '../lib/jwt';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key';

let quotaContext: {
  plan: string;
  planStatus: string;
  isPro: boolean;
  limit: number;
  periodStart: string;
  resetDate: string;
} | null = {
  plan: 'free',
  planStatus: 'inactive',
  isPro: false,
  limit: 300,
  periodStart: '2026-02-01',
  resetDate: '2026-03-01T00:00:00.000Z',
};

const dbChain = {
  select: mock(() => dbChain),
  from: mock(() => dbChain),
  where: mock(() => dbChain),
  groupBy: mock(() => dbChain),
  orderBy: mock(async () => []),
  limit: mock(async () => [{ llmCalls: 42 }]),
};

const resolveQuotaContextMock = mock(async () => quotaContext);

mock.module('../db', () => ({
  db: dbChain,
}));

mock.module('../services/quota-context', () => ({
  resolveQuotaContext: resolveQuotaContextMock,
}));

const { stats } = await import('./stats');

const app = createTestApp((testApp) => {
  testApp.route('/', stats);
});

describe('Stats Routes (unit)', () => {
  const TEST_USER_ID = '00000000-0000-0000-0000-000000000123';

  beforeEach(() => {
    quotaContext = {
      plan: 'free',
      planStatus: 'inactive',
      isPro: false,
      limit: 300,
      periodStart: '2026-02-01',
      resetDate: '2026-03-01T00:00:00.000Z',
    };
    dbChain.limit.mockResolvedValue([{ llmCalls: 42 }]);
  });

  it('GET /v1/usage rejects unauthenticated request', async () => {
    const res = await app.request('http://localhost/v1/usage');
    expect(res.status).toBe(401);
  });

  it('GET /v1/usage returns usage response with shared quota context', async () => {
    const token = await generateSessionToken(TEST_USER_ID, 'stats@example.com');
    const res = await app.request('http://localhost/v1/usage', {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(200);
    expect(resolveQuotaContextMock).toHaveBeenCalledWith(TEST_USER_ID);

    const body = await res.json() as {
      current_usage: number;
      limit: number;
      remaining: number;
      plan: string;
      plan_status: string;
      reset_date: string;
    };

    expect(body).toEqual({
      current_usage: 42,
      limit: 300,
      remaining: 258,
      plan: 'free',
      plan_status: 'inactive',
      reset_date: '2026-03-01T00:00:00.000Z',
    });
  });

  it('GET /v1/usage returns 404 when user context is unavailable', async () => {
    quotaContext = null;

    const token = await generateSessionToken(TEST_USER_ID, 'stats@example.com');
    const res = await app.request('http://localhost/v1/usage', {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'User not found' });
  });
});
