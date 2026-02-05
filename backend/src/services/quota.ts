// Quota enforcement service
import { db } from '../db';
import { users, userUsage } from '../db/schema';
import { eq, and, sql } from 'drizzle-orm';

const FREE_MONTHLY_LLM_CALLS = parseInt(process.env.FREE_MONTHLY_LLM_CALLS || '300');
const PRO_MONTHLY_LLM_CALLS = parseInt(process.env.PRO_MONTHLY_LLM_CALLS || '10000');

export interface QuotaCheckResult {
  allowed: boolean;
  currentUsage: number;
  limit: number;
  plan: string;
}

export interface QuotaStatus extends QuotaCheckResult {
  remaining: number;
  periodStart: string;
  isPro: boolean;
}

interface QuotaContext {
  plan: string;
  isPro: boolean;
  limit: number;
  periodStart: string;
}

async function getQuotaContext(userId: string): Promise<QuotaContext | null> {
  const userRecords = await db
    .select({
      plan: users.plan,
      planStatus: users.planStatus,
      subscriptionPeriodStart: users.subscriptionPeriodStart,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (userRecords.length === 0) return null;

  const user = userRecords[0];
  const isPro = user.plan === 'pro' && user.planStatus === 'active';
  const limit = isPro ? PRO_MONTHLY_LLM_CALLS : FREE_MONTHLY_LLM_CALLS;

  let periodStartStr: string;
  if (isPro && user.subscriptionPeriodStart) {
    periodStartStr = user.subscriptionPeriodStart.toISOString().split('T')[0];
  } else {
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    periodStartStr = monthStart.toISOString().split('T')[0];
  }

  return {
    plan: user.plan,
    isPro,
    limit,
    periodStart: periodStartStr,
  };
}

export async function getQuotaStatus(userId: string): Promise<QuotaStatus> {
  const context = await getQuotaContext(userId);
  if (!context) {
    return {
      allowed: false,
      currentUsage: 0,
      limit: 0,
      plan: 'unknown',
      remaining: 0,
      periodStart: '',
      isPro: false,
    };
  }

  const usageRecords = await db
    .select()
    .from(userUsage)
    .where(
      and(
        eq(userUsage.userId, userId),
        eq(userUsage.monthStart, context.periodStart)
      )
    )
    .limit(1);

  const currentUsage = usageRecords[0]?.llmCalls || 0;
  const remaining = Math.max(0, context.limit - currentUsage);

  return {
    allowed: currentUsage < context.limit,
    currentUsage,
    limit: context.limit,
    plan: context.plan,
    remaining,
    periodStart: context.periodStart,
    isPro: context.isPro,
  };
}

export async function checkQuota(userId: string): Promise<QuotaCheckResult> {
  const status = await getQuotaStatus(userId);
  return {
    allowed: status.allowed,
    currentUsage: status.currentUsage,
    limit: status.limit,
    plan: status.plan,
  };
}

export async function incrementUsageBy(
  userId: string,
  count: number,
  periodStart?: string
): Promise<void> {
  if (count <= 0) return;

  let periodStartStr = periodStart;
  if (!periodStartStr) {
    const context = await getQuotaContext(userId);
    if (!context) return;
    periodStartStr = context.periodStart;
  }

  await db
    .insert(userUsage)
    .values({
      userId,
      monthStart: periodStartStr,
      llmCalls: count,
    })
    .onConflictDoUpdate({
      target: [userUsage.userId, userUsage.monthStart],
      set: {
        llmCalls: sql`${userUsage.llmCalls} + ${count}`,
      },
    });
}

export async function incrementUsage(userId: string): Promise<void> {
  await incrementUsageBy(userId, 1);
}
