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
  // Get user's plan
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

  // Get current month's usage
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const usageRecords = await db
    .select()
    .from(userUsage)
    .where(
      and(
        eq(userUsage.userId, userId),
        eq(userUsage.monthStart, monthStart.toISOString().split('T')[0])
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
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const monthStartStr = monthStart.toISOString().split('T')[0];

  // UPSERT usage record
  await db
    .insert(userUsage)
    .values({
      userId,
      monthStart: monthStartStr,
      llmCalls: 1,
    })
    .onConflictDoUpdate({
      target: [userUsage.userId, userUsage.monthStart],
      set: {
        llmCalls: sql`${userUsage.llmCalls} + 1`,
      },
    });
}
