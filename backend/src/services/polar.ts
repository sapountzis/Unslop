// Polar service for billing checkout and webhooks
import { db } from '../db';
import { users } from '../db/schema';
import { eq } from 'drizzle-orm';

const POLAR_API_KEY = process.env.POLAR_API_KEY;
const POLAR_WEBHOOK_SECRET = process.env.POLAR_WEBHOOK_SECRET;
const POLAR_ENV = process.env.POLAR_ENV || 'production';
const POLAR_API_BASE = POLAR_ENV === 'sandbox'
  ? 'https://sandbox-api.polar.sh'
  : 'https://api.polar.sh';

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


// Cache price ID to avoid fetching on every request
let cachedPriceId: string | null = null;
let cachedPriceIdTimestamp: number = 0;
const CACHE_TTL = 1000 * 60 * 60; // 1 hour

async function getPriceId(): Promise<string> {
  // Dynamically find it from Product ID
  const productId = process.env.POLAR_PRODUCT_ID;
  if (!productId) {
    throw new Error('POLAR_PRODUCT_ID environment variable is required');
  }

  // Check cache
  const now = Date.now();
  if (cachedPriceId && (now - cachedPriceIdTimestamp < CACHE_TTL)) {
    return cachedPriceId;
  }

  // Fetch product to find price
  console.log(`Fetching prices for product ${productId}...`);
  const response = await fetch(`${POLAR_API_BASE}/v1/products/${productId}`, {
    headers: { 'Authorization': `Bearer ${POLAR_API_KEY}` }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch product: ${response.status} ${await response.text()}`);
  }

  const product = await response.json() as any;

  // Find the monthly recurring price
  const price = product.prices.find((p: any) =>
    p.type === 'recurring' &&
    p.recurring_interval === 'month'
  );

  if (!price) {
    throw new Error('No monthly recurring price found for this product');
  }

  // Update cache
  cachedPriceId = price.id;
  cachedPriceIdTimestamp = now;

  return price.id;
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

  // Get the correct price ID (dynamic or static)
  const priceId = await getPriceId();

  // Create Polar checkout
  const response = await fetch(`${POLAR_API_BASE}/v1/checkouts`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${POLAR_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      product_price_id: priceId,
      success_url: `${process.env.APP_URL}/billing/success`,
      cancel_url: `${process.env.APP_URL}/billing/cancel`,
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




export async function handleSubscriptionActive(data: PolarWebhookPayload['data']): Promise<void> {
  const userId = data.metadata?.user_id as string | undefined;

  if (!userId) {
    console.error('Webhook missing user_id in metadata');
    return;
  }

  // Set to Pro active
  await db
    .update(users)
    .set({
      plan: 'pro',
      planStatus: 'active',
      polarCustomerId: data.customer_id,
      polarSubscriptionId: data.subscription_id || data.id, // subscription_id or falling back to id if it's the subscription object itself
    })
    .where(eq(users.id, userId));

  console.log(`Updated user ${userId} to PRO`);
}

export async function handleSubscriptionCancelled(data: PolarWebhookPayload['data']): Promise<void> {
  const userId = data.metadata?.user_id as string | undefined;

  if (!userId) {
    console.error('Webhook missing user_id in metadata');
    return;
  }

  // Set to inactive
  await db
    .update(users)
    .set({
      planStatus: 'inactive',
    })
    .where(eq(users.id, userId));

  console.log(`Updated user ${userId} to INACTIVE`);
}

