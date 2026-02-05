import { beforeEach, describe, expect, it, mock } from 'bun:test';
import { createTestApp } from '../test-utils/app';
import { generateSessionToken, verifySessionToken } from '../lib/jwt';
import { createAuthMiddleware } from '../middleware/auth';
import { createFeedbackRoutes, feedbackSchema } from './feedback';
import { DECISION_VALUES, FEEDBACK_LABEL_VALUES } from '../lib/domain-constants';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key';

const submitFeedbackMock = mock(
  async (): Promise<'ok' | 'post_not_found'> => 'ok',
);

const app = createTestApp((testApp) => {
  testApp.route(
    '/',
    createFeedbackRoutes({
      authMiddleware: createAuthMiddleware({ verifySessionToken }),
      feedbackService: {
        submitFeedback: submitFeedbackMock,
      },
    }),
  );
});

describe('Feedback Routes (unit)', () => {
  const TEST_USER_ID = '00000000-0000-0000-0000-000000000999';

  beforeEach(() => {
    submitFeedbackMock.mockClear();
    submitFeedbackMock.mockResolvedValue('ok');
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

  it('POST /v1/feedback delegates to service and returns ok', async () => {
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
    expect(submitFeedbackMock).toHaveBeenCalledWith({
      userId: TEST_USER_ID,
      postId: payload.post_id,
      renderedDecision: payload.rendered_decision,
      userLabel: payload.user_label,
    });
  });

  it('POST /v1/feedback maps post_not_found', async () => {
    submitFeedbackMock.mockResolvedValueOnce('post_not_found');
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

  it('validator enums are sourced from shared domain constants', () => {
    expect(feedbackSchema.shape.rendered_decision.options).toEqual(Array.from(DECISION_VALUES));
    expect(feedbackSchema.shape.user_label.options).toEqual(Array.from(FEEDBACK_LABEL_VALUES));
  });
});
