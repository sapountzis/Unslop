// Billing tests
import 'dotenv/config';
import { describe, it, expect, mock, beforeEach } from 'bun:test';

// Override specific env vars for testing
process.env.TEST_MODE = 'true';
process.env.POLAR_WEBHOOK_SECRET = process.env.POLAR_WEBHOOK_SECRET || 'test-webhook-secret';
process.env.POLAR_API_KEY = process.env.POLAR_API_KEY || 'test-key';
process.env.POLAR_PRODUCT_ID = process.env.POLAR_PRODUCT_ID || 'prod_test_123';

const mockSelect = mock(() => ({ from: mock(() => ({ where: mock(() => ({ limit: mock(() => Promise.resolve([])) })) })) }));
const mockUpdate = mock(() => ({ set: mock(() => ({ where: mock(() => Promise.resolve([])) })) }));

mock.module('../db', () => ({
  db: {
    select: mockSelect,
    insert: mock(() => ({ values: mock(() => ({ returning: mock(() => Promise.resolve([])) })) })),
    update: mockUpdate,
  },
}));

(global as any).fetch = mock((url: string) => {
  if (url.includes('/v1/products/')) {
    return Promise.resolve(new Response(JSON.stringify({
      prices: [{ id: 'price_123', type: 'recurring', recurring_interval: 'month' }]
    })));
  }
  if (url.includes('/v1/checkouts')) {
    return Promise.resolve(new Response(JSON.stringify({ url: 'https://polar.sh/checkout/test' })));
  }
  return Promise.resolve(new Response('{}', { status: 404 }));
});

const {
  createCheckoutSession,
  handleSubscriptionActive,
  handleSubscriptionCanceled,
  handleSubscriptionUncanceled,
  handleSubscriptionPastDue,
  handleSubscriptionRevoked,
  handleSubscriptionUpdated,
  extractSubscriptionData,
} = await import('../services/polar');

import { Plan, PlanStatus } from '../lib/billing-constants';

function mockPayload(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sub_123',
    customer_id: 'cust_123',
    status: 'active',
    current_period_start: new Date().toISOString(),
    current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    metadata: { user_id: 'test-user-id' },
    ...overrides,
  };
}

describe('createCheckoutSession', () => {
  beforeEach(() => {
    mockSelect.mockClear();
    mockUpdate.mockClear();
  });

  it('creates checkout for free user', async () => {
    mockSelect.mockReturnValue({
      from: mock(() => ({
        where: mock(() => ({
          limit: mock(() => Promise.resolve([{ id: 'u1', email: 'test@example.com', plan: 'free', planStatus: 'inactive' }])),
        })),
      })),
    } as any);

    const result = await createCheckoutSession('u1');
    expect(result.checkout_url).toBe('https://polar.sh/checkout/test');
  });

  it('throws ALREADY_PRO for pro user', async () => {
    mockSelect.mockReturnValue({
      from: mock(() => ({
        where: mock(() => ({
          limit: mock(() => Promise.resolve([{ id: 'u1', email: 'pro@example.com', plan: 'pro', planStatus: 'active' }])),
        })),
      })),
    } as any);

    await expect(createCheckoutSession('u1')).rejects.toThrow('ALREADY_PRO');
  });

  it('throws USER_NOT_FOUND', async () => {
    mockSelect.mockReturnValue({
      from: mock(() => ({ where: mock(() => ({ limit: mock(() => Promise.resolve([])) })) })),
    } as any);

    await expect(createCheckoutSession('u1')).rejects.toThrow('USER_NOT_FOUND');
  });
});

describe('extractSubscriptionData', () => {
  it('extracts valid data', () => {
    const result = extractSubscriptionData(mockPayload());
    expect(result).not.toBeNull();
    expect(result!.subscriptionId).toBe('sub_123');
    expect(result!.userId).toBe('test-user-id');
  });

  it('returns null without subscription_id', () => {
    expect(extractSubscriptionData({ metadata: { user_id: 'u1' } })).toBeNull();
  });

  it('returns null without user_id', () => {
    expect(extractSubscriptionData({ id: 'sub_123', metadata: {} })).toBeNull();
  });
});

describe('webhook handlers', () => {
  beforeEach(() => mockUpdate.mockClear());

  it('handleSubscriptionActive sets PRO/ACTIVE', async () => {
    const mockSet = mock(() => ({ where: mock(() => Promise.resolve()) }));
    mockUpdate.mockReturnValue({ set: mockSet } as any);

    await handleSubscriptionActive(mockPayload());

    expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({
      plan: Plan.PRO,
      planStatus: PlanStatus.ACTIVE,
    }));
  });

  it('handleSubscriptionCanceled sets PRO/CANCELED', async () => {
    const mockSet = mock(() => ({ where: mock(() => Promise.resolve()) }));
    mockUpdate.mockReturnValue({ set: mockSet } as any);

    await handleSubscriptionCanceled(mockPayload({ status: 'canceled' }));

    expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({
      plan: Plan.PRO,
      planStatus: PlanStatus.CANCELED,
    }));
  });

  it('handleSubscriptionRevoked sets FREE/INACTIVE', async () => {
    const mockSet = mock(() => ({ where: mock(() => Promise.resolve()) }));
    mockUpdate.mockReturnValue({ set: mockSet } as any);

    await handleSubscriptionRevoked(mockPayload());

    expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({
      plan: Plan.FREE,
      planStatus: PlanStatus.INACTIVE,
    }));
  });

  it('handleSubscriptionPastDue sets PRO/PAST_DUE', async () => {
    const mockSet = mock(() => ({ where: mock(() => Promise.resolve()) }));
    mockUpdate.mockReturnValue({ set: mockSet } as any);

    await handleSubscriptionPastDue(mockPayload({ status: 'past_due' }));

    expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({
      plan: Plan.PRO,
      planStatus: PlanStatus.PAST_DUE,
    }));
  });

  it('handleSubscriptionUncanceled sets PRO/ACTIVE', async () => {
    const mockSet = mock(() => ({ where: mock(() => Promise.resolve()) }));
    mockUpdate.mockReturnValue({ set: mockSet } as any);

    await handleSubscriptionUncanceled(mockPayload());

    expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({
      plan: Plan.PRO,
      planStatus: PlanStatus.ACTIVE,
    }));
  });

  it('handleSubscriptionUpdated routes correctly', async () => {
    const mockSet = mock(() => ({ where: mock(() => Promise.resolve()) }));
    mockUpdate.mockReturnValue({ set: mockSet } as any);

    await handleSubscriptionUpdated(mockPayload({ status: 'active' }));

    expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({
      plan: Plan.PRO,
      planStatus: PlanStatus.ACTIVE,
    }));
  });

  it('handles missing user_id gracefully', async () => {
    await handleSubscriptionActive(mockPayload({ metadata: {} }));
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
