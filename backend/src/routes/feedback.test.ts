import { beforeEach, describe, expect, it, mock } from 'bun:test';
import { createTestApp } from '../test-utils/app';
import { generateSessionToken } from '../lib/jwt';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key';

const insertValuesMock = mock(async () => undefined);
const insertMock = mock(() => ({
  values: insertValuesMock,
}));

mock.module('../db', () => ({
  db: {
    insert: insertMock,
  },
}));

const { feedback } = await import('./feedback');

const app = createTestApp((testApp) => {
  testApp.route('/', feedback);
});

describe('Feedback Routes (unit)', () => {
  const TEST_USER_ID = '00000000-0000-0000-0000-000000000999';

  beforeEach(() => {
    insertMock.mockClear();
    insertValuesMock.mockClear();
    insertValuesMock.mockResolvedValue(undefined);
  });

  it('POST /v1/feedback rejects unauthenticated requests', async () => {
    const res = await app.request('http://localhost/v1/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        post_id: 'post-1',
        rendered_decision: 'dim',
        user_label: 'should_keep',
      }),
    });

    expect(res.status).toBe(401);
  });

  it('POST /v1/feedback rejects invalid payload', async () => {
    const token = await generateSessionToken(TEST_USER_ID, 'feedback@example.com');
    const res = await app.request('http://localhost/v1/feedback', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ invalid: true }),
    });

    expect(res.status).toBe(400);
  });

  it('POST /v1/feedback inserts feedback directly and returns ok', async () => {
    const token = await generateSessionToken(TEST_USER_ID, 'feedback@example.com');
    const payload = {
      post_id: 'post-1',
      rendered_decision: 'dim',
      user_label: 'should_keep',
    } as const;

    const res = await app.request('http://localhost/v1/feedback', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(insertValuesMock).toHaveBeenCalledWith({
      userId: TEST_USER_ID,
      postId: payload.post_id,
      renderedDecision: payload.rendered_decision,
      userLabel: payload.user_label,
    });
  });

  it('POST /v1/feedback maps FK violation to post_not_found', async () => {
    insertValuesMock.mockRejectedValueOnce({ code: '23503' });
    const token = await generateSessionToken(TEST_USER_ID, 'feedback@example.com');

    const res = await app.request('http://localhost/v1/feedback', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        post_id: 'missing-post',
        rendered_decision: 'hide',
        user_label: 'should_keep',
      }),
    });

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'post_not_found' });
  });
});
