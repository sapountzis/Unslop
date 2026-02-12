import 'dotenv/config';
import { beforeEach, describe, expect, it, mock } from 'bun:test';
import { Plan, PlanStatus } from '../lib/billing-constants';
import { createPolarService } from '../services/polar';

process.env.TEST_MODE = 'true';

let insertReturningRows: unknown[] = [];

const mockSelect = mock(() => ({
  from: mock(() => ({
    where: mock(() => ({
      limit: mock(() => Promise.resolve([])),
    })),
  })),
}));

const mockUpdate = mock(() => ({
  set: mock(() => ({
    where: mock(() => Promise.resolve([])),
  })),
}));

const mockInsert = mock(() => ({
  values: mock(() => ({
    onConflictDoNothing: mock(() => ({
      returning: mock(() => Promise.resolve(insertReturningRows)),
    })),
    returning: mock(() => Promise.resolve(insertReturningRows)),
  })),
}));

const mockDelete = mock(() => ({
  where: mock(() => Promise.resolve([])),
}));

const fetchMock = mock((url: string) => {
  if (url.includes('/v1/products/')) {
    return Promise.resolve(
      new Response(
        JSON.stringify({
          prices: [{ id: 'price_123', type: 'recurring', recurring_interval: 'month' }],
        }),
      ),
    );
  }
  if (url.includes('/v1/checkouts')) {
    return Promise.resolve(new Response(JSON.stringify({ url: 'https://polar.sh/checkout/test' })));
  }
  return Promise.resolve(new Response('{}', { status: 404 }));
});

function buildService() {
  return createPolarService({
    db: {
      select: mockSelect,
      insert: mockInsert,
      update: mockUpdate,
      delete: mockDelete,
    } as never,
    config: {
      apiKey: 'test-key',
      apiBase: 'https://sandbox-api.polar.sh',
      productId: 'prod_test_123',
      appUrl: 'http://localhost:3000',
    },
    fetchImpl: fetchMock as unknown as typeof fetch,
    logger: {
      info: mock(() => undefined),
      warn: mock(() => undefined),
    },
    now: () => new Date('2026-02-05T00:00:00.000Z'),
  });
}

function mockPayload(overrides: Record<string, unknown> = {}) {
  return {
    type: 'subscription.active',
    timestamp: new Date().toISOString(),
    data: {
      id: 'sub_123',
      customer_id: 'cust_123',
      status: 'active',
      current_period_start: new Date().toISOString(),
      current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      metadata: { user_id: 'test-user-id' },
      ...overrides,
    },
  };
}

describe('createCheckoutSession', () => {
  beforeEach(() => {
    mockSelect.mockClear();
    mockInsert.mockClear();
    mockUpdate.mockClear();
  });

  it('creates checkout for free user', async () => {
    mockSelect.mockReturnValue({
      from: mock(() => ({
        where: mock(() => ({
          limit: mock(() => Promise.resolve([{ id: 'u1', email: 'test@example.com', plan: 'free', planStatus: 'inactive' }])),
        })),
      })),
    });

    const service = buildService();
    const result = await service.createCheckoutSession('u1');
    expect(result.checkout_url).toBe('https://polar.sh/checkout/test');
  });

  it('throws ALREADY_PRO for active pro user', async () => {
    mockSelect.mockReturnValue({
      from: mock(() => ({
        where: mock(() => ({
          limit: mock(() => Promise.resolve([{ id: 'u1', email: 'pro@example.com', plan: 'pro', planStatus: 'active' }])),
        })),
      })),
    });

    const service = buildService();
    await expect(service.createCheckoutSession('u1')).rejects.toThrow('ALREADY_PRO');
  });

  it('throws USER_NOT_FOUND', async () => {
    mockSelect.mockReturnValue({
      from: mock(() => ({ where: mock(() => ({ limit: mock(() => Promise.resolve([])) })) })),
    });

    const service = buildService();
    await expect(service.createCheckoutSession('u1')).rejects.toThrow('USER_NOT_FOUND');
  });
});

describe('webhook idempotency', () => {
  beforeEach(() => {
    insertReturningRows = [];
    mockInsert.mockClear();
  });

  it('buildWebhookDeliveryKey is deterministic for event payload', () => {
    const service = buildService();
    const payload = mockPayload();
    const key = service.buildWebhookDeliveryKey(payload);
    const key2 = service.buildWebhookDeliveryKey(payload);

    expect(key).toBe(key2);
    expect(key).toContain('subscription.active');
    expect(key).toContain('sub_123');
  });

  it('claimWebhookDelivery returns non-duplicate when insert succeeds', async () => {
    insertReturningRows = [{ webhookId: 'k1' }];
    const service = buildService();
    const claim = await service.claimWebhookDelivery(mockPayload());

    expect(claim.isDuplicate).toBe(false);
    expect(claim.webhookId).toContain('subscription.active');
  });

  it('claimWebhookDelivery returns duplicate when row already exists', async () => {
    insertReturningRows = [];
    const service = buildService();
    const claim = await service.claimWebhookDelivery(mockPayload());

    expect(claim.isDuplicate).toBe(true);
  });
});

describe('webhook handlers', () => {
  beforeEach(() => {
    mockUpdate.mockClear();
  });

  it('handleSubscriptionActive sets PRO/ACTIVE', async () => {
    const mockSet = mock(() => ({ where: mock(() => Promise.resolve([])) }));
    mockUpdate.mockReturnValue({ set: mockSet });

    const service = buildService();
    await service.handleSubscriptionActive(mockPayload().data);

    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({
        plan: Plan.PRO,
        planStatus: PlanStatus.ACTIVE,
      }),
    );
  });

  it('handleSubscriptionCanceled sets PRO/CANCELED', async () => {
    const mockSet = mock(() => ({ where: mock(() => Promise.resolve([])) }));
    mockUpdate.mockReturnValue({ set: mockSet });

    const service = buildService();
    await service.handleSubscriptionCanceled(mockPayload({ status: 'canceled' }).data);

    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({
        plan: Plan.PRO,
        planStatus: PlanStatus.CANCELED,
      }),
    );
  });

  it('handleSubscriptionRevoked sets FREE/INACTIVE', async () => {
    const mockSet = mock(() => ({ where: mock(() => Promise.resolve([])) }));
    mockUpdate.mockReturnValue({ set: mockSet });

    const service = buildService();
    await service.handleSubscriptionRevoked(mockPayload().data);

    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({
        plan: Plan.FREE,
        planStatus: PlanStatus.INACTIVE,
      }),
    );
  });

  it('handleSubscriptionPastDue sets PRO/PAST_DUE', async () => {
    const mockSet = mock(() => ({ where: mock(() => Promise.resolve([])) }));
    mockUpdate.mockReturnValue({ set: mockSet });

    const service = buildService();
    await service.handleSubscriptionPastDue(mockPayload({ status: 'past_due' }).data);

    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({
        plan: Plan.PRO,
        planStatus: PlanStatus.PAST_DUE,
      }),
    );
  });

  it('handleSubscriptionUncanceled sets PRO/ACTIVE', async () => {
    const mockSet = mock(() => ({ where: mock(() => Promise.resolve([])) }));
    mockUpdate.mockReturnValue({ set: mockSet });

    const service = buildService();
    await service.handleSubscriptionUncanceled(mockPayload().data);

    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({
        plan: Plan.PRO,
        planStatus: PlanStatus.ACTIVE,
      }),
    );
  });

  it('handleSubscriptionUpdated routes correctly', async () => {
    const mockSet = mock(() => ({ where: mock(() => Promise.resolve([])) }));
    mockUpdate.mockReturnValue({ set: mockSet });

    const service = buildService();
    await service.handleSubscriptionUpdated(mockPayload({ status: 'active' }).data);

    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({
        plan: Plan.PRO,
        planStatus: PlanStatus.ACTIVE,
      }),
    );
  });

  it('handles missing user_id gracefully', async () => {
    const service = buildService();
    await service.handleSubscriptionActive(mockPayload({ metadata: {} }).data);
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});

describe('syncUserSubscriptionByEmail', () => {
  beforeEach(() => {
    fetchMock.mockClear();
    mockUpdate.mockClear();
  });

  it('promotes newly created user to PRO when Polar has active subscription for configured product', async () => {
    const mockSet = mock(() => ({ where: mock(() => Promise.resolve([])) }));
    mockUpdate.mockReturnValue({ set: mockSet });
    fetchMock.mockImplementation((url: string) => {
      if (url.includes('/v1/customers?')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              items: [{ id: 'cust_123' }],
            }),
          ),
        );
      }

      if (url.includes('/v1/customers/cust_123/state')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              id: 'cust_123',
              active_subscriptions: [
                {
                  id: 'sub_123',
                  product_id: 'prod_test_123',
                  status: 'active',
                  current_period_start: '2026-02-01T00:00:00.000Z',
                  current_period_end: '2026-03-01T00:00:00.000Z',
                },
              ],
            }),
          ),
        );
      }

      return Promise.resolve(new Response('{}', { status: 404 }));
    });

    const service = buildService();
    await service.syncUserSubscriptionByEmail({
      userId: 'u1',
      email: 'test@example.com',
    });

    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({
        plan: Plan.PRO,
        planStatus: PlanStatus.ACTIVE,
        polarCustomerId: 'cust_123',
        polarSubscriptionId: 'sub_123',
      }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/v1/customers?email=test%40example.com'),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer test-key',
        }),
      }),
    );
  });

  it('leaves user unchanged when no Polar customer exists for email', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url.includes('/v1/customers?')) {
        return Promise.resolve(new Response(JSON.stringify({ items: [] })));
      }

      return Promise.resolve(new Response('{}', { status: 404 }));
    });

    const service = buildService();
    await service.syncUserSubscriptionByEmail({
      userId: 'u1',
      email: 'missing@example.com',
    });

    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
