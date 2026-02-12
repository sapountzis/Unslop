import { z } from 'zod';
import { PolarStatus } from '../lib/billing-constants';

const subscriptionDataSchema = z
  .object({
    id: z.string().optional(),
    subscription_id: z.string().optional(),
    subscriptionId: z.string().optional(),
    customer_id: z.string().optional(),
    customerId: z.string().optional(),
    customer: z
      .object({
        id: z.string().optional(),
      })
      .passthrough()
      .optional(),
    status: z.string().optional(),
    current_period_start: z.union([z.string(), z.date()]).optional(),
    currentPeriodStart: z.union([z.string(), z.date()]).optional(),
    current_period_end: z.union([z.string(), z.date()]).optional(),
    currentPeriodEnd: z.union([z.string(), z.date()]).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

export type PolarSubscriptionData = z.infer<typeof subscriptionDataSchema>;

export interface NormalizedSubscriptionData {
  subscriptionId: string;
  userId: string;
  customerId?: string;
  status?: string;
  periodStart?: Date;
  periodEnd?: Date;
}

export type SubscriptionStatusAction = 'activate' | 'cancel' | 'past_due' | 'ignore';

function parseDate(value: string | Date | undefined): Date | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export function getSubscriptionIdFromWebhookData(data: unknown): string | null {
  const parsed = subscriptionDataSchema.safeParse(data);
  if (!parsed.success) {
    return null;
  }

  const subscriptionId = parsed.data.id || parsed.data.subscription_id || parsed.data.subscriptionId;
  return subscriptionId && subscriptionId.length > 0 ? subscriptionId : null;
}

export function normalizeSubscriptionData(data: unknown): NormalizedSubscriptionData | null {
  const parsed = subscriptionDataSchema.safeParse(data);
  if (!parsed.success) {
    return null;
  }

  const subscriptionId = parsed.data.id || parsed.data.subscription_id || parsed.data.subscriptionId;
  if (!subscriptionId) {
    return null;
  }

  const userId = readString(parsed.data.metadata?.user_id) ?? readString(parsed.data.metadata?.userId);
  if (!userId) {
    return null;
  }

  return {
    subscriptionId,
    userId,
    customerId: parsed.data.customer_id || parsed.data.customerId || parsed.data.customer?.id,
    status: parsed.data.status,
    periodStart: parseDate(parsed.data.current_period_start ?? parsed.data.currentPeriodStart),
    periodEnd: parseDate(parsed.data.current_period_end ?? parsed.data.currentPeriodEnd),
  };
}

export function mapSubscriptionStatusToAction(status: string | undefined): SubscriptionStatusAction {
  switch (status) {
    case PolarStatus.ACTIVE:
    case PolarStatus.TRIALING:
      return 'activate';
    case PolarStatus.CANCELED:
      return 'cancel';
    case PolarStatus.PAST_DUE:
    case PolarStatus.UNPAID:
      return 'past_due';
    default:
      return 'ignore';
  }
}
