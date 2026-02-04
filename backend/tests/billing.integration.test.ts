import { describe, it, beforeAll, afterAll, expect } from 'bun:test';
import { db } from '../src/db';
import { users, webhookDeliveries } from '../src/db/schema';
import { eq } from 'drizzle-orm';
import { createCheckoutSession } from '../src/services/polar';
import { generateSessionToken } from '../src/lib/jwt';
import * as setup from './setup-polar-sandbox';

describe('Billing E2E Integration Tests (Polar Sandbox)', () => {
  let testProduct: any;
  let testUser: any;
  let testUserId: string;
  let testAuthToken: string;

  beforeAll(async () => {
    const [user] = await db.insert(users).values({
      email: `integration-test-${Date.now()}@example.com`,
      plan: 'free',
      planStatus: 'inactive',
    }).returning();
    
    testUser = user;
    testUserId = user.id;
    testAuthToken = await generateSessionToken(user.id, user.email);

    console.log(`Created test user: ${testUserId}`);
  });

  afterAll(async () => {
    await db.delete(users).where(eq(users.id, testUserId));
    await db.delete(webhookDeliveries).where(eq(webhookDeliveries.userId, testUserId));
    console.log(`Cleaned up test user: ${testUserId}`);
  });

  it.skipIf(!process.env.POLAR_SANDBOX_ACCESS_TOKEN)('should create checkout session with correct metadata', async () => {
    const session = await createCheckoutSession(testUserId);
    
    expect(session.checkout_url).toContain('polar.sh/checkout/');
    expect(session.checkout_url).toBeTruthy();
  });

  it('should handle subscription.created webhook', async () => {
    const webhookPayload = {
      type: 'subscription.created',
      timestamp: new Date().toISOString(),
      data: {
        id: 'sub_test_1',
        created_at: new Date().toISOString(),
        modified_at: new Date().toISOString(),
        amount: 399,
        currency: 'EUR',
        recurring_interval: 'month',
        recurring_interval_count: 1,
        current_period_start: new Date().toISOString(),
        current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        cancel_at_period_end: false,
        canceled_at: null,
        started_at: new Date().toISOString(),
        ends_at: null,
        ended_at: null,
        customer_id: 'cust_test_1',
        product_id: 'prod_test_1',
        price_id: 'price_test_1',
        discount_id: null,
        checkout_id: null,
        customer_cancellation_reason: null,
        customer_cancellation_comment: null,
        metadata: { user_id: testUserId },
        status: 'active',
        customer: {
          id: 'cust_test_1',
          created_at: new Date().toISOString(),
          modified_at: new Date().toISOString(),
          metadata: {},
          email: testUser.email,
          email_verified: true,
          name: 'Test User',
          billing_address: { country: 'US' },
          tax_id: [],
          organization_id: 'org_test',
          avatar_url: null,
          deleted_at: null,
          external_id: null,
        },
        product: {
          id: 'prod_test_1',
          created_at: new Date().toISOString(),
          modified_at: new Date().toISOString(),
          name: 'Test Product',
          description: 'Test Description',
          is_recurring: true,
          is_archived: false,
          organization_id: 'org_test',
          metadata: {},
          prices: [],
          benefits: [],
          medias: [],
          attached_custom_fields: [],
          recurring_interval: 'month',
          recurring_interval_count: 1,
          trial_interval: 'month',
          trial_interval_count: 0,
        },
        discount: null,
        trial_start: null,
        trial_end: null,
        prices: [],
        meters: [],
      },
    };

    const { handleSubscriptionActive } = await import('../src/services/polar');
    await handleSubscriptionActive(webhookPayload.data);

    const [updatedUser] = await db
      .select()
      .from(users)
      .where(eq(users.id, testUserId))
      .limit(1);

    expect(updatedUser).toBeDefined();
    expect(updatedUser.plan).toBe('pro');
    expect(updatedUser.planStatus).toBe('active');
    expect(updatedUser.polarCustomerId).toBe('cust_test_1');
    expect(updatedUser.polarSubscriptionId).toBe('sub_test_1');
    expect(updatedUser.subscriptionPeriodStart).toBeInstanceOf(Date);
    expect(updatedUser.subscriptionPeriodEnd).toBeInstanceOf(Date);
  });

  it('should handle subscription.canceled webhook', async () => {
    const webhookPayload = {
      type: 'subscription.canceled',
      timestamp: new Date().toISOString(),
      data: {
        id: 'sub_test_1',
        status: 'canceled',
        cancel_at_period_end: true,
        current_period_start: new Date().toISOString(),
        current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        customer_id: 'cust_test_1',
        subscription_id: 'sub_test_1',
        metadata: { user_id: testUserId },
        product: { id: 'prod_test_1' },
        customer: { id: 'cust_test_1', billing_address: { country: 'US' } },
        prices: [],
        meters: [],
        created_at: new Date().toISOString(),
        modified_at: new Date().toISOString(),
        amount: 399,
        currency: 'EUR',
        recurring_interval: 'month',
        recurring_interval_count: 1,
        canceled_at: new Date().toISOString(),
        started_at: new Date().toISOString(),
        ends_at: null,
        ended_at: null,
        checkout_id: null,
        discount_id: null,
        discount: null,
        product_id: 'prod_test_1',
        price_id: 'price_test_1',
        trial_start: null,
        trial_end: null,
      },
    };

    const { handleSubscriptionCancelled } = await import('../src/services/polar');
    await handleSubscriptionCancelled(webhookPayload.data);

    const [updatedUser] = await db
      .select()
      .from(users)
      .where(eq(users.id, testUserId))
      .limit(1);

    expect(updatedUser.planStatus).toBe('inactive');
  });

  it('should handle subscription.uncensored (via updated)', async () => {
    const cancelPayload = {
      type: 'subscription.updated',
      timestamp: new Date().toISOString(),
      data: {
        id: 'sub_test_1',
        status: 'canceled',
        cancel_at_period_end: true,
        current_period_start: new Date().toISOString(),
        current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        customer_id: 'cust_test_1',
        subscription_id: 'sub_test_1',
        metadata: { user_id: testUserId },
        product: { id: 'prod_test_1' },
        customer: { id: 'cust_test_1', billing_address: { country: 'US' } },
        prices: [],
        meters: [],
        created_at: new Date().toISOString(),
        modified_at: new Date().toISOString(),
      },
    };

    const { handleSubscriptionCancelled } = await import('../src/services/polar');
    await handleSubscriptionCancelled(cancelPayload.data);

    const uncensoredPayload = {
      type: 'subscription.updated',
      timestamp: new Date().toISOString(),
      data: {
        id: 'sub_test_1',
        status: 'active',
        cancel_at_period_end: false,
        current_period_start: new Date().toISOString(),
        current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        customer_id: 'cust_test_1',
        subscription_id: 'sub_test_1',
        metadata: { user_id: testUserId },
        product: { id: 'prod_test_1' },
        customer: { id: 'cust_test_1', billing_address: { country: 'US' } },
        prices: [],
        meters: [],
        created_at: new Date().toISOString(),
        modified_at: new Date().toISOString(),
      },
    };

    const { handleSubscriptionActive } = await import('../src/services/polar');
    await handleSubscriptionActive(uncensoredPayload.data);

    const [updatedUser] = await db
      .select()
      .from(users)
      .where(eq(users.id, testUserId))
      .limit(1);

    expect(updatedUser.planStatus).toBe('active');
  });

  it('should handle webhook with missing user_id gracefully', async () => {
    await db.update(users).set({ plan: 'free', planStatus: 'inactive' }).where(eq(users.id, testUserId));

    const webhookPayload = {
      type: 'subscription.created',
      timestamp: new Date().toISOString(),
      data: {
        id: 'sub_no_user',
        status: 'active',
        metadata: {},
        current_period_start: new Date().toISOString(),
        current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        customer_id: 'cust_no_user',
        subscription_id: 'sub_no_user',
        product: { id: 'prod_test_1' },
        customer: { id: 'cust_no_user', billing_address: { country: 'US' } },
        prices: [],
        meters: [],
        created_at: new Date().toISOString(),
        modified_at: new Date().toISOString(),
      },
    };

    const { handleSubscriptionActive } = await import('../src/services/polar');
    await handleSubscriptionActive(webhookPayload.data);

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, testUserId))
      .limit(1);

    expect(user.plan).toBe('free');
    expect(user.planStatus).toBe('inactive');
  });
});
