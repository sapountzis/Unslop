// Billing routes tests with mocked dependencies
import { describe, it, expect, mock, beforeEach } from 'bun:test';
import { generateSessionToken } from '../lib/jwt';

// Set test mode before any imports
process.env.TEST_MODE = 'true';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
process.env.POLAR_WEBHOOK_SECRET = process.env.POLAR_WEBHOOK_SECRET || 'test-webhook-secret';
process.env.POLAR_API_KEY = process.env.POLAR_API_KEY || 'test-key';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://user:pass@localhost:5432/test_db';

// Mock the database before importing the routes
const mockSelect = mock(() => ({ from: mock(() => ({ where: mock(() => ({ limit: mock(() => Promise.resolve([])) })) })) }));
const mockInsert = mock(() => ({ values: mock(() => ({ returning: mock(() => Promise.resolve([])) })) }));
const mockUpdate = mock(() => ({ set: mock(() => ({ where: mock(() => Promise.resolve([])) })) }));

const mockDb = {
  select: mockSelect,
  insert: mockInsert,
  update: mockUpdate,
  delete: mock(() => ({ where: mock(() => Promise.resolve([])) })),
};

// Mock the db module
mock.module('../db', () => ({
  db: mockDb,
}));

// Mock the fetch for Polar API calls
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

// Import routes after mocking
import { billing } from './billing';

// Helper to create auth token
async function getAuthToken(userId: string, email: string): Promise<string> {
  return await generateSessionToken(userId, email);
}

// Helper to make requests to the billing app
async function billingRequest(path: string, options: RequestInit = {}) {
  const url = new URL(path, process.env.APP_URL || 'http://localhost:3000');
  const req = new Request(url.toString(), options);
  return billing.fetch(req);
}

describe('POST /v1/billing/create-checkout', () => {
  beforeEach(() => {
    // Reset mocks before each test
    mockSelect.mockClear();
    mockInsert.mockClear();
    mockUpdate.mockClear();
  });

  it('should reject unauthenticated requests', async () => {
    const res = await billingRequest('/v1/billing/create-checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan: 'pro-monthly' }),
    });

    expect(res.status).toBe(401);
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

    const token = await getAuthToken(testUser.id, testUser.email);

    const res = await billingRequest('/v1/billing/create-checkout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ plan: 'pro-monthly' }),
    });

    expect(res.status).toBe(200);

    const data = (await res.json()) as { checkout_url?: string };
    expect(data.checkout_url).toBe('https://polar.sh/checkout/test');
  });

  it('should return 409 for already pro user', async () => {
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

    const token = await getAuthToken(testUser.id, testUser.email);

    const res = await billingRequest('/v1/billing/create-checkout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ plan: 'pro-monthly' }),
    });

    expect(res.status).toBe(409);

    const data = (await res.json()) as { error?: string };
    expect(data.error).toBe('already_pro');
  });

  it('should reject invalid plan', async () => {
    const testUser = {
      id: 'test-user-id-3',
      email: 'test3@example.com',
      plan: 'free',
      planStatus: 'inactive',
    };

    const mockFrom = mock(() => ({
      where: mock(() => ({
        limit: mock(() => Promise.resolve([testUser])),
      })),
    }));
    mockSelect.mockReturnValue({ from: mockFrom } as any);

    const token = await getAuthToken(testUser.id, testUser.email);

    const res = await billingRequest('/v1/billing/create-checkout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ plan: 'invalid-plan' }),
    });

    expect(res.status).toBe(400);
  });

  it('should return 500 when user not found', async () => {
    // Mock the db.select to return empty array (user not found)
    const mockFrom = mock(() => ({
      where: mock(() => ({
        limit: mock(() => Promise.resolve([])),
      })),
    }));
    mockSelect.mockReturnValue({ from: mockFrom } as any);

    const token = await getAuthToken('non-existent-user', 'nonexistent@example.com');

    const res = await billingRequest('/v1/billing/create-checkout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ plan: 'pro-monthly' }),
    });

    expect(res.status).toBe(500);
  });
});

// Checkout tests look fine, moving to Webhook tests...
describe('POST /v1/billing/polar/webhook', () => {
  beforeEach(() => {
    // Reset mocks before each test
    mockSelect.mockClear();
    mockInsert.mockClear();
    mockUpdate.mockClear();
  });

  it('should reject invalid signature', async () => {
    const res = await billingRequest('/v1/billing/polar/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'webhook-id': 'invalid',
        'webhook-timestamp': 'invalid',
        'webhook-signature': 'invalid',
      },
      body: JSON.stringify({ type: 'test', data: {} }),
    });

    expect(res.status).toBe(403);
  });

  // Helper to create a compliant mock subscription payload
  // Based on the fields required by the Polar SDK Zod schema in the error logs
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
        country: 'US', // Required field
      },
      tax_id: [],
      organization_id: 'org_123',
      avatar_url: 'https://example.com/avatar.png',
      deleted_at: null, // Required nullable
      external_id: null, // Required nullable
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
      trial_interval: 'month', // Required enum
      trial_interval_count: 0, // Required
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
      trial_start: null, // Required nullable
      trial_end: null,   // Required nullable
      prices: [],        // Required array
      meters: [],        // Required array
    };

    // Merge overrides deeply (simplified for this test case)
    const data = { ...defaultData, ...overrides };
    // Ensure nested objects are merged if provided in overrides
    if (overrides.customer) data.customer = { ...defaultCustomer, ...overrides.customer };
    if (overrides.product) data.product = { ...defaultProduct, ...overrides.product };

    return data;
  }

  it('should accept valid webhook and update user for subscription.active', async () => {
    const payloadData = createMockSubscriptionPayload({
      status: 'active',
      current_period_start: '2026-02-04T00:00:00Z',
      current_period_end: '2026-03-04T00:00:00Z',
    });

    const webhookPayload = {
      type: 'subscription.active',
      timestamp: new Date().toISOString(),
      data: payloadData,
    };

    // Standard Webhooks signature generation
    const webhookId = `msg_${Math.random().toString(36).substring(7)}`;
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const secret = process.env.POLAR_WEBHOOK_SECRET || 'test-webhook-secret';

    const toSign = `${webhookId}.${timestamp}.${JSON.stringify(webhookPayload)}`;

    // HMAC-SHA256
    const crypto = await import('crypto');
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(toSign);
    const signature = `v1,${hmac.digest('base64')}`;

    // Mock the db.update to succeed
    const mockWhere = mock(() => Promise.resolve([]));
    const mockSet = mock(() => ({ where: mockWhere }));
    mockUpdate.mockReturnValue({ set: mockSet } as any);

    const res = await billingRequest('/v1/billing/polar/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'webhook-id': webhookId,
        'webhook-timestamp': timestamp,
        'webhook-signature': signature,
      },
      body: JSON.stringify(webhookPayload),
    });

    expect(res.status).toBe(200);

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

    const webhookPayload = {
      type: 'subscription.updated',
      timestamp: new Date().toISOString(),
      data: payloadData,
    };

    // Standard Webhooks signature generation
    const webhookId = `msg_${Math.random().toString(36).substring(7)}`;
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const secret = process.env.POLAR_WEBHOOK_SECRET || 'test-webhook-secret';
    const toSign = `${webhookId}.${timestamp}.${JSON.stringify(webhookPayload)}`;
    const crypto = await import('crypto');
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(toSign);
    const signature = `v1,${hmac.digest('base64')}`;

    // Mock the db.update to succeed
    const mockWhere = mock(() => Promise.resolve([]));
    const mockSet = mock(() => ({ where: mockWhere }));
    mockUpdate.mockReturnValue({ set: mockSet } as any);

    const res = await billingRequest('/v1/billing/polar/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'webhook-id': webhookId,
        'webhook-timestamp': timestamp,
        'webhook-signature': signature,
      },
      body: JSON.stringify(webhookPayload),
    });

    expect(res.status).toBe(200);

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

    const webhookPayload = {
      type: 'subscription.active', // Corrected from subscription.activated
      timestamp: new Date().toISOString(),
      data: payloadData,
    };

    // Standard Webhooks signature generation
    const webhookId = `msg_${Math.random().toString(36).substring(7)}`;
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const secret = process.env.POLAR_WEBHOOK_SECRET || 'test-webhook-secret';
    const toSign = `${webhookId}.${timestamp}.${JSON.stringify(webhookPayload)}`;
    const crypto = await import('crypto');
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(toSign);
    const signature = `v1,${hmac.digest('base64')}`;

    const res = await billingRequest('/v1/billing/polar/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'webhook-id': webhookId,
        'webhook-timestamp': timestamp,
        'webhook-signature': signature,
      },
      body: JSON.stringify(webhookPayload),
    });

    // Should still return 200 so Polar doesn't retry
    expect(res.status).toBe(200);

    // Verify update was NOT called (no user_id)
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('should handle unknown webhook types gracefully', async () => {
    // For unknown types, we can just send a minimal valid-looking structure or just standard fields,
    // but the validator might still check the body if it tries to parse based on type.
    const webhookPayload = {
      type: 'unknown.event',
      timestamp: new Date().toISOString(),
      data: {
        id: 'test_id',
        // Minimal data
      },
    };

    // Standard Webhooks signature generation
    const webhookId = `msg_${Math.random().toString(36).substring(7)}`;
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const secret = process.env.POLAR_WEBHOOK_SECRET || 'test-webhook-secret';
    const toSign = `${webhookId}.${timestamp}.${JSON.stringify(webhookPayload)}`;
    const crypto = await import('crypto');
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(toSign);
    const signature = `v1,${hmac.digest('base64')}`;

    const res = await billingRequest('/v1/billing/polar/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'webhook-id': webhookId,
        'webhook-timestamp': timestamp,
        'webhook-signature': signature,
      },
      body: JSON.stringify(webhookPayload),
    });

    // Expect 500 because the SDK throws 'Unknown event type' and it bubbles up
    expect(res.status).toBe(500);

    // Verify update was NOT called (unknown type)
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('should handle subscription.canceled webhook', async () => {
    const payloadData = createMockSubscriptionPayload({
      status: 'canceled',
    });

    const webhookPayload = {
      type: 'subscription.canceled',
      timestamp: new Date().toISOString(),
      data: payloadData,
    };

    const webhookId = `msg_${Math.random().toString(36).substring(7)}`;
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const secret = process.env.POLAR_WEBHOOK_SECRET || 'test-webhook-secret';
    const toSign = `${webhookId}.${timestamp}.${JSON.stringify(webhookPayload)}`;
    const crypto = await import('crypto');
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(toSign);
    const signature = `v1,${hmac.digest('base64')}`;

    // Mock the db.update to succeed
    const mockWhere = mock(() => Promise.resolve([]));
    const mockSet = mock(() => ({ where: mockWhere }));
    mockUpdate.mockReturnValue({ set: mockSet } as any);

    const res = await billingRequest('/v1/billing/polar/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'webhook-id': webhookId,
        'webhook-timestamp': timestamp,
        'webhook-signature': signature,
      },
      body: JSON.stringify(webhookPayload),
    });

    expect(res.status).toBe(200);

    // Verify update was called to set planStatus to inactive
    expect(mockSet).toHaveBeenCalledWith({
      planStatus: 'inactive',
    });
  });

  it('should handle subscription.revoked webhook', async () => {
    const payloadData = createMockSubscriptionPayload({
      status: 'canceled', // Use 'canceled' as 'revoked' is not a valid enum value in data
    });

    const webhookPayload = {
      type: 'subscription.revoked',
      timestamp: new Date().toISOString(),
      data: payloadData,
    };

    const webhookId = `msg_${Math.random().toString(36).substring(7)}`;
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const secret = process.env.POLAR_WEBHOOK_SECRET || 'test-webhook-secret';
    const toSign = `${webhookId}.${timestamp}.${JSON.stringify(webhookPayload)}`;
    const crypto = await import('crypto');
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(toSign);
    const signature = `v1,${hmac.digest('base64')}`;

    // Mock the db.update to succeed
    const mockWhere = mock(() => Promise.resolve([]));
    const mockSet = mock(() => ({ where: mockWhere }));
    mockUpdate.mockReturnValue({ set: mockSet } as any);

    const res = await billingRequest('/v1/billing/polar/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'webhook-id': webhookId,
        'webhook-timestamp': timestamp,
        'webhook-signature': signature,
      },
      body: JSON.stringify(webhookPayload),
    });

    expect(res.status).toBe(200);

    // Verify update was called to set planStatus to inactive
    expect(mockSet).toHaveBeenCalledWith({
      planStatus: 'inactive',
    });
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

    const webhookPayload = {
      type: 'subscription.created',
      timestamp: new Date().toISOString(), // Required by Zod
      data: payloadData,
    };

    const webhookId = `msg_${Math.random().toString(36).substring(7)}`;
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const secret = process.env.POLAR_WEBHOOK_SECRET || 'test-webhook-secret';
    const toSign = `${webhookId}.${timestamp}.${JSON.stringify(webhookPayload)}`;
    const crypto = await import('crypto');
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(toSign);
    const signature = `v1,${hmac.digest('base64')}`;

    // Mock the db.update to succeed
    const mockWhere = mock(() => Promise.resolve([]));
    const mockSet = mock(() => ({ where: mockWhere }));
    mockUpdate.mockReturnValue({ set: mockSet } as any);

    const res = await billingRequest('/v1/billing/polar/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'webhook-id': webhookId,
        'webhook-timestamp': timestamp,
        'webhook-signature': signature,
      },
      body: JSON.stringify(webhookPayload),
    });

    expect(res.status).toBe(200);

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
