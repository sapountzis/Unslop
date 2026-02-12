import { beforeEach, describe, expect, it, mock } from 'bun:test';
import { createTestApp } from '../test-utils/app';
import { createBillingRoutes } from './billing';

process.env.POLAR_WEBHOOK_SECRET = process.env.POLAR_WEBHOOK_SECRET || 'test-webhook-secret';

const validateEventMock = mock(() => ({
  type: 'subscription.updated',
  timestamp: new Date('2026-02-05T20:00:00.000Z'),
  data: {
    id: 'sub_123',
    status: 'active',
    metadata: { user_id: 'user-1' },
  },
}));

class TestWebhookVerificationError extends Error {}

const claimWebhookDeliveryByIdMock = mock(async () => ({
  webhookId: 'wh_123',
  isDuplicate: false,
}));

const releaseWebhookDeliveryByIdMock = mock(async () => undefined);
const handleSubscriptionUpdatedMock = mock(async () => undefined);
const handleSubscriptionPastDueMock = mock(async () => undefined);

mock.module('@polar-sh/sdk/webhooks', () => ({
  validateEvent: validateEventMock,
  WebhookVerificationError: TestWebhookVerificationError,
}));

const app = createTestApp((testApp) => {
  testApp.route(
    '/',
    createBillingRoutes({
      authMiddleware: async (_c, next) => {
        await next();
      },
      polarService: {
        createCheckoutSession: mock(async () => ({ checkout_url: 'https://polar.sh/checkout/test' })),
        syncUserSubscriptionByEmail: mock(async () => undefined),
        buildWebhookDeliveryKey: mock(() => 'legacy'),
        claimWebhookDelivery: mock(async () => ({ webhookId: 'legacy', isDuplicate: false })),
        claimWebhookDeliveryById: claimWebhookDeliveryByIdMock,
        releaseWebhookDeliveryById: releaseWebhookDeliveryByIdMock,
        handleSubscriptionActive: mock(async () => undefined),
        handleSubscriptionCanceled: mock(async () => undefined),
        handleSubscriptionUncanceled: mock(async () => undefined),
        handleSubscriptionRevoked: mock(async () => undefined),
        handleSubscriptionPastDue: handleSubscriptionPastDueMock,
        handleSubscriptionUpdated: handleSubscriptionUpdatedMock,
      },
      logger: {
        info: mock(() => undefined),
        error: mock(() => undefined),
      },
      polarWebhookSecret: process.env.POLAR_WEBHOOK_SECRET!,
    }),
  );
});

describe('Billing webhook route', () => {
  beforeEach(() => {
    validateEventMock.mockClear();
    claimWebhookDeliveryByIdMock.mockClear();
    releaseWebhookDeliveryByIdMock.mockClear();
    handleSubscriptionUpdatedMock.mockClear();
    handleSubscriptionPastDueMock.mockClear();
    validateEventMock.mockReturnValue({
      type: 'subscription.updated',
      timestamp: new Date('2026-02-05T20:00:00.000Z'),
      data: {
        id: 'sub_123',
        status: 'active',
        metadata: { user_id: 'user-1' },
      },
    });
  });

  it('verifies with SDK and deduplicates by webhook-id header', async () => {
    const response = await app.request('http://localhost/v1/billing/polar/webhook', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'webhook-id': 'wh_123',
        'webhook-timestamp': '1738798800',
        'webhook-signature': 'v1,test',
      },
      body: JSON.stringify({ any: 'payload' }),
    });

    expect(response.status).toBe(200);
    expect(validateEventMock).toHaveBeenCalledTimes(1);
    expect(claimWebhookDeliveryByIdMock).toHaveBeenCalledWith({
      webhookId: 'wh_123',
      eventType: 'subscription.updated',
      subscriptionId: 'sub_123',
    });
    expect(releaseWebhookDeliveryByIdMock).not.toHaveBeenCalled();
  });

  it('returns non-2xx when processing fails so provider retries', async () => {
    handleSubscriptionUpdatedMock.mockRejectedValueOnce(new Error('db failed'));

    const response = await app.request('http://localhost/v1/billing/polar/webhook', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'webhook-id': 'wh_124',
        'webhook-timestamp': '1738798801',
        'webhook-signature': 'v1,test',
      },
      body: JSON.stringify({ any: 'payload' }),
    });

    expect(response.status).toBe(500);
    expect(releaseWebhookDeliveryByIdMock).toHaveBeenCalledWith('wh_124');
  });

  it('returns 403 when signature verification fails', async () => {
    validateEventMock.mockImplementationOnce(() => {
      throw new TestWebhookVerificationError('invalid signature');
    });

    const response = await app.request('http://localhost/v1/billing/polar/webhook', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'webhook-id': 'wh_bad',
        'webhook-timestamp': '1738798802',
        'webhook-signature': 'v1,bad',
      },
      body: JSON.stringify({ any: 'payload' }),
    });

    expect(response.status).toBe(403);
  });

  it('dispatches subscription.past_due to past-due handler', async () => {
    validateEventMock.mockReturnValueOnce({
      type: 'subscription.past_due',
      timestamp: new Date('2026-02-05T20:00:00.000Z'),
      data: {
        id: 'sub_123',
        status: 'past_due',
        metadata: { user_id: 'user-1' },
      },
    });

    const response = await app.request('http://localhost/v1/billing/polar/webhook', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'webhook-id': 'wh_125',
        'webhook-timestamp': '1738798803',
        'webhook-signature': 'v1,test',
      },
      body: JSON.stringify({ any: 'payload' }),
    });

    expect(response.status).toBe(200);
    expect(handleSubscriptionPastDueMock).toHaveBeenCalledTimes(1);
    expect(handleSubscriptionUpdatedMock).not.toHaveBeenCalled();
  });

  it('falls back to raw payload for subscription.past_due when sdk parser rejects the event type', async () => {
    validateEventMock.mockImplementationOnce(() => {
      throw new Error('Failed to parse event');
    });

    const response = await app.request('http://localhost/v1/billing/polar/webhook', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'webhook-id': 'wh_126',
        'webhook-timestamp': '1738798804',
        'webhook-signature': 'v1,test',
      },
      body: JSON.stringify({
        type: 'subscription.past_due',
        data: {
          id: 'sub_123',
          status: 'past_due',
          metadata: { user_id: 'user-1' },
        },
      }),
    });

    expect(response.status).toBe(200);
    expect(handleSubscriptionPastDueMock).toHaveBeenCalledTimes(1);
  });
});
