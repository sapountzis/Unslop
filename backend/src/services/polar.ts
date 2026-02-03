// Polar service for billing checkout and webhooks
import { db } from '../db';
import { users } from '../db/schema';
import { eq } from 'drizzle-orm';

const POLAR_API_KEY = process.env.POLAR_API_KEY;
const POLAR_WEBHOOK_SECRET = process.env.POLAR_WEBHOOK_SECRET;
const POLAR_API_BASE = 'https://api.polar.sh';

// Only require API key in production, not in test mode
if (!POLAR_API_KEY && !process.env.TEST_MODE) {
  throw new Error('POLAR_API_KEY environment variable is required');
}
if (!POLAR_WEBHOOK_SECRET && !process.env.TEST_MODE) {
  throw new Error('POLAR_WEBHOOK_SECRET environment variable is required');
}

export interface CheckoutSession {
  checkout_url: string;
}

export async function createCheckoutSession(userId: string): Promise<CheckoutSession> {
  // Get current user to check if already Pro
  const userRecords = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (userRecords.length === 0) {
    throw new Error('User not found');
  }

  const user = userRecords[0];

  // Check if already active Pro
  if (user.plan === 'pro' && user.planStatus === 'active') {
    throw new Error('ALREADY_PRO');
  }

  // Create Polar checkout
  const response = await fetch(`${POLAR_API_BASE}/v1/checkouts`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${POLAR_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      product_price_id: process.env.POLAR_PRO_MONTHLY_PRICE_ID!,
      success_url: 'https://getunslop.com/billing/success',
      cancel_url: 'https://getunslop.com/billing/cancel',
      customer_email: user.email,
      metadata: {
        user_id: userId,
      },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Polar API error: ${response.status} ${error}`);
  }

  const data = (await response.json()) as { url: string };

  return {
    checkout_url: data.url,
  };
}

export interface PolarWebhookPayload {
  type: string;
  data: {
    id: string;
    customer_id?: string;
    subscription_id?: string;
    metadata?: Record<string, unknown>;
    status?: string;
  };
}

export async function verifyWebhookSignature(
  payload: string,
  signature: string
): Promise<boolean> {
  const crypto = await import('crypto');

  if (!POLAR_WEBHOOK_SECRET) {
    throw new Error('POLAR_WEBHOOK_SECRET environment variable is required');
  }

  const hmac = crypto.createHmac('sha256', POLAR_WEBHOOK_SECRET);
  hmac.update(payload);
  const digest = hmac.digest('hex');

  // Polar uses a specific signature format
  const expectedSignature = `sha256=${digest}`;

  return signature === expectedSignature;
}

export async function handleSubscriptionWebhook(payload: PolarWebhookPayload): Promise<void> {
  const { type, data } = payload;

  // Extract user_id from metadata
  const userId = data.metadata?.user_id as string | undefined;

  if (!userId) {
    console.error('Webhook missing user_id in metadata');
    return;
  }

  switch (type) {
    case 'subscription.created':
    case 'subscription.activated':
    case 'subscription.renewed':
      // Set to Pro active
      await db
        .update(users)
        .set({
          plan: 'pro',
          planStatus: 'active',
          polarCustomerId: data.customer_id,
          polarSubscriptionId: data.subscription_id,
        })
        .where(eq(users.id, userId));
      break;

    case 'subscription.cancelled':
    case 'subscription.expired':
      // Set to inactive
      await db
        .update(users)
        .set({
          planStatus: 'inactive',
        })
        .where(eq(users.id, userId));
      break;

    default:
      console.log(`Unhandled webhook type: ${type}`);
  }
}
