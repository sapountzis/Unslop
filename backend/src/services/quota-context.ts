import { eq } from 'drizzle-orm';
import { db } from '../db';
import { users } from '../db/schema';

const FREE_MONTHLY_LLM_CALLS = parseInt(process.env.FREE_MONTHLY_LLM_CALLS || '300');
const PRO_MONTHLY_LLM_CALLS = parseInt(process.env.PRO_MONTHLY_LLM_CALLS || '10000');

export interface QuotaContext {
  plan: string;
  planStatus: string;
  isPro: boolean;
  limit: number;
  periodStart: string;
  resetDate: string;
}

export async function resolveQuotaContext(userId: string): Promise<QuotaContext | null> {
  const userRecords = await db
    .select({
      plan: users.plan,
      planStatus: users.planStatus,
      subscriptionPeriodStart: users.subscriptionPeriodStart,
      subscriptionPeriodEnd: users.subscriptionPeriodEnd,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (userRecords.length === 0) {
    return null;
  }

  const user = userRecords[0];
  const isPro = user.plan === 'pro' && user.planStatus === 'active';
  const limit = isPro ? PRO_MONTHLY_LLM_CALLS : FREE_MONTHLY_LLM_CALLS;

  const now = new Date();
  let periodStart: string;
  let resetDate: string;

  if (isPro && user.subscriptionPeriodStart) {
    periodStart = user.subscriptionPeriodStart.toISOString().split('T')[0];
    if (user.subscriptionPeriodEnd) {
      resetDate = user.subscriptionPeriodEnd.toISOString();
    } else {
      const fallbackEnd = new Date(user.subscriptionPeriodStart);
      fallbackEnd.setMonth(fallbackEnd.getMonth() + 1);
      resetDate = fallbackEnd.toISOString();
    }
  } else {
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    periodStart = monthStart.toISOString().split('T')[0];
    resetDate = nextMonth.toISOString();
  }

  return {
    plan: user.plan,
    planStatus: user.planStatus,
    isPro,
    limit,
    periodStart,
    resetDate,
  };
}
