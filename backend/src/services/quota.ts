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

export async function checkQuota(userId: string): Promise<QuotaCheckResult> {
  // Get user's plan and subscription period
  const userRecords = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (userRecords.length === 0) {
    return { allowed: false, currentUsage: 0, limit: 0, plan: 'unknown' };
  }

  const user = userRecords[0];

  // Determine limit
  const isPro = user.plan === 'pro' && user.planStatus === 'active';
  const limit = isPro ? PRO_MONTHLY_LLM_CALLS : FREE_MONTHLY_LLM_CALLS;

  // Determine usage period start
  let periodStartStr: string;

  if (isPro && user.subscriptionPeriodStart) {
    // For active Pro users with a subscription period, use that
    periodStartStr = user.subscriptionPeriodStart.toISOString().split('T')[0];
  } else {
    // Fallback to 1st of current calendar month
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    periodStartStr = monthStart.toISOString().split('T')[0];
  }

  const usageRecords = await db
    .select()
    .from(userUsage)
    .where(
      and(
        eq(userUsage.userId, userId),
        eq(userUsage.monthStart, periodStartStr)
      )
    )
    .limit(1);

  const currentUsage = usageRecords[0]?.llmCalls || 0;

  return {
    allowed: currentUsage < limit,
    currentUsage,
    limit,
    plan: user.plan,
  };
}

export async function incrementUsage(userId: string): Promise<void> {
  // We need to fetch the user to know their period start
  // This adds a DB call, but ensures accuracy.
  const userRecords = await db
    .select({
      plan: users.plan,
      planStatus: users.planStatus,
      subscriptionPeriodStart: users.subscriptionPeriodStart,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (userRecords.length === 0) return;
  const user = userRecords[0];
  const isPro = user.plan === 'pro' && user.planStatus === 'active';

  let periodStartStr: string;

  if (isPro && user.subscriptionPeriodStart) {
    periodStartStr = user.subscriptionPeriodStart.toISOString().split('T')[0];
  } else {
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    periodStartStr = monthStart.toISOString().split('T')[0];
  }

  // UPSERT usage record
  await db
    .insert(userUsage)
    .values({
      userId,
      monthStart: periodStartStr,
      llmCalls: 1,
    })
    .onConflictDoUpdate({
      target: [userUsage.userId, userUsage.monthStart],
      set: {
        llmCalls: sql`${userUsage.llmCalls} + 1`,
      },
    });
}
