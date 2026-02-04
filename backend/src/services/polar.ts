// Polar billing service
import { db } from '../db';
import { users } from '../db/schema';
import { eq } from 'drizzle-orm';
import { logger } from '../lib/logger';
import { Plan, PlanStatus, PolarStatus, BillingError } from '../lib/billing-constants';

const POLAR_API_KEY = process.env.POLAR_API_KEY;
const POLAR_API_BASE = (process.env.POLAR_ENV || 'production') === 'sandbox'
  ? 'https://sandbox-api.polar.sh'
  : 'https://api.polar.sh';

if (!POLAR_API_KEY && !process.env.TEST_MODE) {
  throw new Error('POLAR_API_KEY environment variable is required');
}
if (!process.env.POLAR_WEBHOOK_SECRET && !process.env.TEST_MODE) {
  throw new Error('POLAR_WEBHOOK_SECRET environment variable is required');
}

let cachedPriceId: string | null = null;
let cachedPriceIdTimestamp = 0;

async function getPriceId(): Promise<string> {
  const productId = process.env.POLAR_PRODUCT_ID;
  if (!productId) throw new Error('POLAR_PRODUCT_ID required');

  if (cachedPriceId && (Date.now() - cachedPriceIdTimestamp < 3600000)) {
    return cachedPriceId;
  }

  const res = await fetch(`${POLAR_API_BASE}/v1/products/${productId}`, {
    headers: { 'Authorization': `Bearer ${POLAR_API_KEY}` }
  });
  if (!res.ok) throw new Error(`Failed to fetch product: ${res.status}`);

  const product = await res.json() as { prices: { id: string; type: string; recurring_interval: string }[] };
  const price = product.prices.find(p => p.type === 'recurring' && p.recurring_interval === 'month');
  if (!price) throw new Error('No monthly recurring price found');

  cachedPriceId = price.id;
  cachedPriceIdTimestamp = Date.now();
  return price.id;
}

export async function createCheckoutSession(userId: string): Promise<{ checkout_url: string }> {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw new Error(BillingError.USER_NOT_FOUND);
  if (user.plan === Plan.PRO && user.planStatus === PlanStatus.ACTIVE) {
    throw new Error(BillingError.ALREADY_PRO);
  }

  const res = await fetch(`${POLAR_API_BASE}/v1/checkouts`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${POLAR_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      product_price_id: await getPriceId(),
      success_url: `${process.env.APP_URL}/billing/success`,
      cancel_url: `${process.env.APP_URL}/billing/cancel`,
      customer_email: user.email,
      metadata: { user_id: userId },
    }),
  });
  if (!res.ok) throw new Error(`Polar API error: ${res.status}`);

  const data = await res.json() as { url: string };
  return { checkout_url: data.url };
}

export interface SubscriptionData {
  subscriptionId: string;
  userId: string;
  customerId?: string;
  status?: string;
  periodStart?: Date;
  periodEnd?: Date;
}

export function extractSubscriptionData(data: Record<string, unknown>): SubscriptionData | null {
  const subscriptionId = (data.id || data.subscription_id) as string | undefined;
  if (!subscriptionId) {
    logger.warn('Webhook missing subscription_id');
    return null;
  }

  const metadata = data.metadata as Record<string, unknown> | undefined;
  const userId = metadata?.user_id as string | undefined;
  if (!userId) {
    logger.warn('Webhook missing user_id in metadata', { subscriptionId });
    return null;
  }

  return {
    subscriptionId,
    userId,
    customerId: (data.customer_id || (data.customer as Record<string, unknown>)?.id) as string | undefined,
    status: data.status as string | undefined,
    periodStart: data.current_period_start ? new Date(data.current_period_start as string) : undefined,
    periodEnd: data.current_period_end ? new Date(data.current_period_end as string) : undefined,
  };
}

async function setUserTier(userId: string, plan: string, planStatus: string, extra: Partial<{
  polarCustomerId: string;
  polarSubscriptionId: string;
  subscriptionPeriodStart: Date;
  subscriptionPeriodEnd: Date;
}> = {}): Promise<void> {
  await db.update(users).set({ plan, planStatus, ...extra }).where(eq(users.id, userId));
}

export async function handleSubscriptionActive(data: Record<string, unknown>): Promise<void> {
  const sub = extractSubscriptionData(data);
  if (!sub) return;
  await setUserTier(sub.userId, Plan.PRO, PlanStatus.ACTIVE, {
    polarCustomerId: sub.customerId,
    polarSubscriptionId: sub.subscriptionId,
    subscriptionPeriodStart: sub.periodStart,
    subscriptionPeriodEnd: sub.periodEnd,
  });
  logger.info('Subscription active', { userId: sub.userId });
}

export async function handleSubscriptionCanceled(data: Record<string, unknown>): Promise<void> {
  const sub = extractSubscriptionData(data);
  if (!sub) return;
  await setUserTier(sub.userId, Plan.PRO, PlanStatus.CANCELED, {
    polarSubscriptionId: sub.subscriptionId,
    subscriptionPeriodEnd: sub.periodEnd,
  });
  logger.info('Subscription canceled', { userId: sub.userId, accessUntil: sub.periodEnd });
}

export async function handleSubscriptionUncanceled(data: Record<string, unknown>): Promise<void> {
  const sub = extractSubscriptionData(data);
  if (!sub) return;
  await setUserTier(sub.userId, Plan.PRO, PlanStatus.ACTIVE, {
    polarCustomerId: sub.customerId,
    polarSubscriptionId: sub.subscriptionId,
    subscriptionPeriodStart: sub.periodStart,
    subscriptionPeriodEnd: sub.periodEnd,
  });
  logger.info('Subscription uncanceled', { userId: sub.userId });
}

export async function handleSubscriptionRevoked(data: Record<string, unknown>): Promise<void> {
  const sub = extractSubscriptionData(data);
  if (!sub) return;
  await setUserTier(sub.userId, Plan.FREE, PlanStatus.INACTIVE, {
    polarSubscriptionId: sub.subscriptionId,
  });
  logger.info('Subscription revoked', { userId: sub.userId });
}

export async function handleSubscriptionPastDue(data: Record<string, unknown>): Promise<void> {
  const sub = extractSubscriptionData(data);
  if (!sub) return;
  await setUserTier(sub.userId, Plan.PRO, PlanStatus.PAST_DUE, {
    polarSubscriptionId: sub.subscriptionId,
  });
  logger.warn('Subscription past due', { userId: sub.userId });
}

export async function handleSubscriptionUpdated(data: Record<string, unknown>): Promise<void> {
  const sub = extractSubscriptionData(data);
  if (!sub) return;

  switch (sub.status) {
    case PolarStatus.ACTIVE:
    case PolarStatus.TRIALING:
      await handleSubscriptionActive(data);
      break;
    case PolarStatus.CANCELED:
      await handleSubscriptionCanceled(data);
      break;
    case PolarStatus.PAST_DUE:
    case PolarStatus.UNPAID:
      await handleSubscriptionPastDue(data);
      break;
  }
}
