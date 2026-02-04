// Billing routes tests with mocked dependencies
import { describe, it, expect, mock, beforeEach } from 'bun:test';

// Set test mode and env vars BEFORE any imports
process.env.TEST_MODE = 'true';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
process.env.POLAR_WEBHOOK_SECRET = process.env.POLAR_WEBHOOK_SECRET || 'test-webhook-secret';
process.env.POLAR_API_KEY = process.env.POLAR_API_KEY || 'test-key';
process.env.POLAR_PRODUCT_ID = 'prod_test_123';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://user:pass@localhost:5432/test_db';

// Mock the database BEFORE importing services
const mockSelect = mock(() => ({ from: mock(() => ({ where: mock(() => ({ limit: mock(() => Promise.resolve([])) })) })) }));
const mockInsert = mock(() => ({ values: mock(() => ({ returning: mock(() => Promise.resolve([])), onConflictDoNothing: mock(() => Promise.resolve([])) })) }));
const mockUpdate = mock(() => ({ set: mock(() => ({ where: mock(() => Promise.resolve([])) })) }));

mock.module('../db', () => ({
  db: {
    select: mockSelect,
    insert: mockInsert,
    update: mockUpdate,
    delete: mock(() => ({ where: mock(() => Promise.resolve([])) })),
  },
}));

// Mock fetch BEFORE importing services
const mockFetch = mock((req: Request | string) => {
  const url = typeof req === 'string' ? req : req.url;

  if (url.includes('/v1/products/')) {
    return Promise.resolve(
      new Response(JSON.stringify({
        prices: [
          {
            id: 'price_123',
            type: 'recurring',
            recurring_interval: 'month'
          }
        ]
      }), {
        status: 200,
        statusText: 'OK',
        headers: { 'Content-Type': 'application/json' },
      })
    );
  }

  if (url.includes('/v1/checkouts')) {
    return Promise.resolve(
      new Response(JSON.stringify({ url: 'https://polar.sh/checkout/test' }), {
        status: 200,
        statusText: 'OK',
        headers: { 'Content-Type': 'application/json' },
      })
    );
  }

  return Promise.resolve(new Response('{}', { status: 404 }));
});
(global as any).fetch = mockFetch;

// Now we can import the services - the mocks should be in place
const { createCheckoutSession, handleSubscriptionActive, handleSubscriptionCancelled, handleSubscriptionUncensored } = await import("../services/polar");

describe('createCheckoutSession', () => {
  beforeEach(() => {
    // Reset mocks before each test
    mockSelect.mockClear();
    mockInsert.mockClear();
    mockUpdate.mockClear();
  });

  it('should create checkout for free user', async () => {
    const testUser = {
      id: 'test-user-id-1',
      email: 'test@example.com',
      plan: 'free',
      planStatus: 'inactive',
    };

    // Mock the db.select to return a test user
    const mockFrom = mock(() => ({
      where: mock(() => ({
        limit: mock(() => Promise.resolve([testUser])),
      })),
    }));
    mockSelect.mockReturnValue({ from: mockFrom } as any);

    const result = await createCheckoutSession(testUser.id);

    expect(result.checkout_url).toBe('https://polar.sh/checkout/test');
  });

  it('should throw ALREADY_PRO for already pro user', async () => {
    const testUser = {
      id: 'test-user-id-2',
      email: 'pro@example.com',
      plan: 'pro',
      planStatus: 'active',
    };

    // Mock the db.select to return a pro user
    const mockFrom = mock(() => ({
      where: mock(() => ({
        limit: mock(() => Promise.resolve([testUser])),
      })),
    }));
    mockSelect.mockReturnValue({ from: mockFrom } as any);

    await expect(createCheckoutSession(testUser.id)).rejects.toThrow('ALREADY_PRO');
  });

  it('should throw error when user not found', async () => {
    // Mock the db.select to return empty array (user not found)
    const mockFrom = mock(() => ({
      where: mock(() => ({
        limit: mock(() => Promise.resolve([])),
      })),
    }));
    mockSelect.mockReturnValue({ from: mockFrom } as any);

    await expect(createCheckoutSession('non-existent-user')).rejects.toThrow('User not found');
  });
});

describe('Polar webhook handlers', () => {
  beforeEach(() => {
    // Reset mocks before each test
    mockSelect.mockClear();
    mockInsert.mockClear();
    mockUpdate.mockClear();
  });

  // Helper to create a compliant mock subscription payload
  function createMockSubscriptionPayload(overrides: any = {}) {
    const defaultCustomer = {
      id: 'cust_123',
      created_at: new Date().toISOString(),
      modified_at: new Date().toISOString(),
      metadata: {},
      email: 'test@example.com',
      email_verified: true,
      name: 'Test User',
      billing_address: {
        country: 'US',
      },
      tax_id: [],
      organization_id: 'org_123',
      avatar_url: 'https://example.com/avatar.png',
      deleted_at: null,
      external_id: null,
    };

    const defaultProduct = {
      id: 'prod_123',
      created_at: new Date().toISOString(),
      modified_at: new Date().toISOString(),
      name: 'Pro Plan',
      description: 'Pro Subscription',
      is_recurring: true,
      is_archived: false,
      organization_id: 'org_123',
      metadata: {},
      prices: [],
      benefits: [],
      medias: [],
      attached_custom_fields: [],
      recurring_interval: 'month',
      recurring_interval_count: 1,
      trial_interval: 'month',
      trial_interval_count: 0,
    };

    const defaultData = {
      id: 'sub_123',
      created_at: new Date().toISOString(),
      modified_at: new Date().toISOString(),
      amount: 1000,
      currency: 'USD',
      recurring_interval: 'month',
      recurring_interval_count: 1,
      current_period_start: new Date().toISOString(),
      current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      cancel_at_period_end: false,
      canceled_at: null,
      started_at: new Date().toISOString(),
      ends_at: null,
      ended_at: null,
      customer_id: 'cust_123',
      product_id: 'prod_123',
      price_id: 'price_123',
      discount_id: null,
      checkout_id: null,
      customer_cancellation_reason: null,
      customer_cancellation_comment: null,
      metadata: { user_id: 'test-user-id' },
      status: 'active',
      customer: defaultCustomer,
      product: defaultProduct,
      discount: null,
      trial_start: null,
      trial_end: null,
      prices: [],
      meters: [],
    };

    const data = { ...defaultData, ...overrides };
    if (overrides.customer) data.customer = { ...defaultCustomer, ...overrides.customer };
    if (overrides.product) data.product = { ...defaultProduct, ...overrides.product };

    return data;
  }

  it('should update user for subscription.active', async () => {
    const payloadData = createMockSubscriptionPayload({
      status: 'active',
      current_period_start: '2026-02-04T00:00:00Z',
      current_period_end: '2026-03-04T00:00:00Z',
    });

    // Mock the db.update to succeed
    const mockWhere = mock(() => Promise.resolve([]));
    const mockSet = mock(() => ({ where: mockWhere }));
    mockUpdate.mockReturnValue({ set: mockSet } as any);

    await handleSubscriptionActive(payloadData);

    // Verify update was called with correct values
    expect(mockUpdate).toHaveBeenCalled();
    expect(mockSet).toHaveBeenCalledWith({
      plan: 'pro',
      planStatus: 'active',
      polarCustomerId: 'cust_123',
      polarSubscriptionId: 'sub_123',
      subscriptionPeriodStart: new Date('2026-02-04T00:00:00Z'),
      subscriptionPeriodEnd: new Date('2026-03-04T00:00:00Z'),
    });
  });

  it('should handle subscription.updated webhook (renewal)', async () => {
    const payloadData = createMockSubscriptionPayload({
      id: 'sub_renewed',
      customer_id: 'cust_renewed',
      status: 'active',
      current_period_start: '2026-03-04T00:00:00Z',
      current_period_end: '2026-04-04T00:00:00Z',
      customer: { id: 'cust_renewed' }
    });

    // Mock the db.update to succeed
    const mockWhere = mock(() => Promise.resolve([]));
    const mockSet = mock(() => ({ where: mockWhere }));
    mockUpdate.mockReturnValue({ set: mockSet } as any);

    await handleSubscriptionActive(payloadData);

    // Verify update was called with correct values
    expect(mockSet).toHaveBeenCalledWith({
      plan: 'pro',
      planStatus: 'active',
      polarCustomerId: 'cust_renewed',
      polarSubscriptionId: 'sub_renewed',
      subscriptionPeriodStart: new Date('2026-03-04T00:00:00Z'),
      subscriptionPeriodEnd: new Date('2026-04-04T00:00:00Z'),
    });
  });

  it('should handle webhook missing user_id gracefully', async () => {
    const payloadData = createMockSubscriptionPayload({
      metadata: {}, // No user_id
    });

    await handleSubscriptionActive(payloadData);

    // Verify update was NOT called (no user_id)
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('should handle subscription.canceled webhook', async () => {
    const payloadData = createMockSubscriptionPayload({
      status: 'canceled',
    });

    // Mock the db.update to succeed
    const mockWhere = mock(() => Promise.resolve([]));
    const mockSet = mock(() => ({ where: mockWhere }));
    mockUpdate.mockReturnValue({ set: mockSet } as any);

    await handleSubscriptionCancelled(payloadData);

    // Verify update was called to set planStatus to inactive
    expect(mockSet).toHaveBeenCalledWith({
      planStatus: 'inactive',
    });
  });

  it('should handle subscription.revoked webhook', async () => {
    const payloadData = createMockSubscriptionPayload({
      status: 'canceled', // Use 'canceled' as 'revoked' is not a valid enum value in data
    });

    // Mock the db.update to succeed
    const mockWhere = mock(() => Promise.resolve([]));
    const mockSet = mock(() => ({ where: mockWhere }));
    mockUpdate.mockReturnValue({ set: mockSet } as any);

    await handleSubscriptionCancelled(payloadData);

    // Verify update was called to set planStatus to inactive
    expect(mockSet).toHaveBeenCalledWith({
      planStatus: 'inactive',
    });
  });

  it('should handle subscription.updated with uncanceled status', async () => {
    const payloadData = createMockSubscriptionPayload({
      status: 'active',
      cancel_at_period_end: false,
    });

    const mockWhere = mock(() => Promise.resolve([]));
    const mockSet = mock(() => ({ where: mockWhere }));
    mockUpdate.mockReturnValue({ set: mockSet } as any);

    await handleSubscriptionUncensored(payloadData);

    expect(mockSet).toHaveBeenCalledWith({
      plan: 'pro',
      planStatus: 'active',
      polarCustomerId: 'cust_123',
      polarSubscriptionId: 'sub_123',
      subscriptionPeriodStart: expect.any(Date),
      subscriptionPeriodEnd: expect.any(Date),
    });
  });

  it('should handle subscription.updated with missing user_id gracefully', async () => {
    const payloadData = createMockSubscriptionPayload({
      metadata: {}, // No user_id
    });

    await handleSubscriptionUncensored(payloadData);

    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('should handle subscription.created webhook', async () => {
    const payloadData = createMockSubscriptionPayload({
      id: 'sub_new',
      customer_id: 'cust_new',
      status: 'active',
      current_period_start: '2026-02-04T00:00:00Z',
      current_period_end: '2026-03-04T00:00:00Z',
      customer: { id: 'cust_new' }
    });

    // Mock the db.update to succeed
    const mockWhere = mock(() => Promise.resolve([]));
    const mockSet = mock(() => ({ where: mockWhere }));
    mockUpdate.mockReturnValue({ set: mockSet } as any);

    await handleSubscriptionActive(payloadData);

    // Verify update was called with correct values
    expect(mockSet).toHaveBeenCalledWith({
      plan: 'pro',
      planStatus: 'active',
      polarCustomerId: 'cust_new',
      polarSubscriptionId: 'sub_new',
      subscriptionPeriodStart: new Date('2026-02-04T00:00:00Z'),
      subscriptionPeriodEnd: new Date('2026-03-04T00:00:00Z'),
    });
  });
});
