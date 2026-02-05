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

let terminalResults: unknown[] = [];

const selectMock = mock(() => dbChain);

const dbChain = {
  select: selectMock,
  from: mock(() => dbChain),
  where: mock(() => dbChain),
  groupBy: mock(() => dbChain),
  orderBy: mock(async () => {
    const value = terminalResults.shift();
    return (value ?? []) as unknown[];
  }),
  limit: mock(async () => {
    const value = terminalResults.shift();
    return (value ?? []) as unknown[];
  }),
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
    terminalResults = [];
    selectMock.mockClear();
    resolveQuotaContextMock.mockClear();
  });

  it('GET /v1/stats returns expected shape using two queries (summary + daily)', async () => {
    terminalResults = [
      [
        {
          allKeep: 10,
          allDim: 4,
          allHide: 1,
          last30Keep: 3,
          last30Dim: 2,
          last30Hide: 1,
          todayKeep: 1,
          todayDim: 1,
          todayHide: 0,
        },
      ],
      [
        { date: '2026-02-01', decision: 'keep', count: 2 },
        { date: '2026-02-01', decision: 'dim', count: 1 },
      ],
    ];

    const token = await generateSessionToken(TEST_USER_ID, 'stats@example.com');
    const res = await app.request('http://localhost/v1/stats', {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(200);
    expect(selectMock).toHaveBeenCalledTimes(2);
    expect(await res.json()).toEqual({
      all_time: { keep: 10, dim: 4, hide: 1, total: 15 },
      last_30_days: { keep: 3, dim: 2, hide: 1, total: 6 },
      today: { keep: 1, dim: 1, hide: 0, total: 2 },
      daily_breakdown: [
        { date: '2026-02-01', decision: 'keep', count: 2 },
        { date: '2026-02-01', decision: 'dim', count: 1 },
      ],
    });
  });

  it('GET /v1/usage rejects unauthenticated request', async () => {
    const res = await app.request('http://localhost/v1/usage');
    expect(res.status).toBe(401);
  });

  it('GET /v1/usage returns usage response with shared quota context', async () => {
    terminalResults = [[{ llmCalls: 42 }]];
    const token = await generateSessionToken(TEST_USER_ID, 'stats@example.com');
    const res = await app.request('http://localhost/v1/usage', {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(200);
    expect(resolveQuotaContextMock).toHaveBeenCalledWith(TEST_USER_ID);

    const body = (await res.json()) as {
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
