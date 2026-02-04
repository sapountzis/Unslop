// Billing routes tests with mocked dependencies
import { describe, it, expect, mock, beforeEach } from 'bun:test';
import { generateSessionToken } from '../lib/jwt';

// Set test mode before any imports
process.env.TEST_MODE = 'true';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
process.env.POLAR_WEBHOOK_SECRET = process.env.POLAR_WEBHOOK_SECRET || 'test-webhook-secret';
process.env.POLAR_API_KEY = process.env.POLAR_API_KEY || 'test-key';

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
const mockFetch = mock(() => {
  return Promise.resolve(
    new Response('{"url":"https://polar.sh/checkout/test"}', {
      status: 200,
      statusText: 'OK',
      headers: { 'Content-Type': 'application/json' },
    })
  );
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
        'x-polar-signature': 'invalid-signature',
      },
      body: JSON.stringify({ type: 'test', data: {} }),
    });

    expect(res.status).toBe(401);
  });

  it('should accept valid webhook and update user for subscription.activated', async () => {
    const webhookPayload = {
      type: 'subscription.activated',
      data: {
        id: 'sub_123',
        customer_id: 'cust_123',
        subscription_id: 'sub_123',
        metadata: { user_id: 'test-user-id' },
      },
    };

    // Compute valid signature
    const crypto = await import('crypto');
    const POLAR_WEBHOOK_SECRET = process.env.POLAR_WEBHOOK_SECRET || 'test-webhook-secret';
    const hmac = crypto.createHmac('sha256', POLAR_WEBHOOK_SECRET);
    hmac.update(JSON.stringify(webhookPayload));
    const signature = `sha256=${hmac.digest('hex')}`;

    // Mock the db.update to succeed
    const mockWhere = mock(() => Promise.resolve([]));
    const mockSet = mock(() => ({ where: mockWhere }));
    mockUpdate.mockReturnValue({ set: mockSet } as any);

    const res = await billingRequest('/v1/billing/polar/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-polar-signature': signature,
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
    });
  });

  it('should handle subscription.cancelled webhook', async () => {
    const webhookPayload = {
      type: 'subscription.cancelled',
      data: {
        id: 'sub_123',
        metadata: { user_id: 'test-user-id' },
      },
    };

    const crypto = await import('crypto');
    const POLAR_WEBHOOK_SECRET = process.env.POLAR_WEBHOOK_SECRET || 'test-webhook-secret';
    const hmac = crypto.createHmac('sha256', POLAR_WEBHOOK_SECRET);
    hmac.update(JSON.stringify(webhookPayload));
    const signature = `sha256=${hmac.digest('hex')}`;

    // Mock the db.update to succeed
    const mockWhere = mock(() => Promise.resolve([]));
    const mockSet = mock(() => ({ where: mockWhere }));
    mockUpdate.mockReturnValue({ set: mockSet } as any);

    const res = await billingRequest('/v1/billing/polar/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-polar-signature': signature,
      },
      body: JSON.stringify(webhookPayload),
    });

    expect(res.status).toBe(200);

    // Verify update was called to set planStatus to inactive
    expect(mockSet).toHaveBeenCalledWith({
      planStatus: 'inactive',
    });
  });

  it('should handle subscription.expired webhook', async () => {
    const webhookPayload = {
      type: 'subscription.expired',
      data: {
        id: 'sub_123',
        metadata: { user_id: 'test-user-id' },
      },
    };

    const crypto = await import('crypto');
    const POLAR_WEBHOOK_SECRET = process.env.POLAR_WEBHOOK_SECRET || 'test-webhook-secret';
    const hmac = crypto.createHmac('sha256', POLAR_WEBHOOK_SECRET);
    hmac.update(JSON.stringify(webhookPayload));
    const signature = `sha256=${hmac.digest('hex')}`;

    // Mock the db.update to succeed
    const mockWhere = mock(() => Promise.resolve([]));
    const mockSet = mock(() => ({ where: mockWhere }));
    mockUpdate.mockReturnValue({ set: mockSet } as any);

    const res = await billingRequest('/v1/billing/polar/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-polar-signature': signature,
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
    const webhookPayload = {
      type: 'subscription.created',
      data: {
        id: 'sub_new',
        customer_id: 'cust_new',
        subscription_id: 'sub_new',
        metadata: { user_id: 'test-user-id' },
      },
    };

    const crypto = await import('crypto');
    const POLAR_WEBHOOK_SECRET = process.env.POLAR_WEBHOOK_SECRET || 'test-webhook-secret';
    const hmac = crypto.createHmac('sha256', POLAR_WEBHOOK_SECRET);
    hmac.update(JSON.stringify(webhookPayload));
    const signature = `sha256=${hmac.digest('hex')}`;

    // Mock the db.update to succeed
    const mockWhere = mock(() => Promise.resolve([]));
    const mockSet = mock(() => ({ where: mockWhere }));
    mockUpdate.mockReturnValue({ set: mockSet } as any);

    const res = await billingRequest('/v1/billing/polar/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-polar-signature': signature,
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
    });
  });

  it('should handle subscription.renewed webhook', async () => {
    const webhookPayload = {
      type: 'subscription.renewed',
      data: {
        id: 'sub_renewed',
        customer_id: 'cust_renewed',
        subscription_id: 'sub_renewed',
        metadata: { user_id: 'test-user-id' },
      },
    };

    const crypto = await import('crypto');
    const POLAR_WEBHOOK_SECRET = process.env.POLAR_WEBHOOK_SECRET || 'test-webhook-secret';
    const hmac = crypto.createHmac('sha256', POLAR_WEBHOOK_SECRET);
    hmac.update(JSON.stringify(webhookPayload));
    const signature = `sha256=${hmac.digest('hex')}`;

    // Mock the db.update to succeed
    const mockWhere = mock(() => Promise.resolve([]));
    const mockSet = mock(() => ({ where: mockWhere }));
    mockUpdate.mockReturnValue({ set: mockSet } as any);

    const res = await billingRequest('/v1/billing/polar/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-polar-signature': signature,
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
    });
  });

  it('should handle webhook missing user_id gracefully', async () => {
    const webhookPayload = {
      type: 'subscription.activated',
      data: {
        id: 'sub_123',
        customer_id: 'cust_123',
        subscription_id: 'sub_123',
        metadata: {}, // No user_id
      },
    };

    const crypto = await import('crypto');
    const POLAR_WEBHOOK_SECRET = process.env.POLAR_WEBHOOK_SECRET || 'test-webhook-secret';
    const hmac = crypto.createHmac('sha256', POLAR_WEBHOOK_SECRET);
    hmac.update(JSON.stringify(webhookPayload));
    const signature = `sha256=${hmac.digest('hex')}`;

    const res = await billingRequest('/v1/billing/polar/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-polar-signature': signature,
      },
      body: JSON.stringify(webhookPayload),
    });

    // Should still return 200 so Polar doesn't retry
    expect(res.status).toBe(200);

    // Verify update was NOT called (no user_id)
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('should handle unknown webhook types gracefully', async () => {
    const webhookPayload = {
      type: 'unknown.event',
      data: {
        id: 'test_id',
        metadata: { user_id: 'test-user-id' },
      },
    };

    const crypto = await import('crypto');
    const POLAR_WEBHOOK_SECRET = process.env.POLAR_WEBHOOK_SECRET || 'test-webhook-secret';
    const hmac = crypto.createHmac('sha256', POLAR_WEBHOOK_SECRET);
    hmac.update(JSON.stringify(webhookPayload));
    const signature = `sha256=${hmac.digest('hex')}`;

    const res = await billingRequest('/v1/billing/polar/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-polar-signature': signature,
      },
      body: JSON.stringify(webhookPayload),
    });

    // Should still return 200
    expect(res.status).toBe(200);

    // Verify update was NOT called (unknown type)
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
