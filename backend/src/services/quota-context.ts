import { eq } from 'drizzle-orm';
import { users } from '../db/schema';
import type { Database } from '../db';
import { Plan, PlanStatus } from '../lib/billing-constants';

export interface QuotaContext {
  plan: string;
  planStatus: string;
  isPro: boolean;
  limit: number;
  periodStart: string;
  resetDate: string;
}

export interface QuotaContextService {
  resolveQuotaContext: (userId: string) => Promise<QuotaContext | null>;
}

export interface QuotaContextDeps {
  db: Database;
  quotas: {
    freeMonthlyLlmCalls: number;
    proMonthlyLlmCalls: number;
  };
  now?: () => Date;
}

export function createQuotaContextService(deps: QuotaContextDeps): QuotaContextService {
  const now = deps.now ?? (() => new Date());

  async function resolveQuotaContext(userId: string): Promise<QuotaContext | null> {
    const userRecords = await deps.db
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
    const isPro = user.plan === Plan.PRO && user.planStatus === PlanStatus.ACTIVE;
    const limit = isPro ? deps.quotas.proMonthlyLlmCalls : deps.quotas.freeMonthlyLlmCalls;

    const current = now();
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
      const monthStart = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), 1));
      const nextMonth = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() + 1, 1));
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

  return {
    resolveQuotaContext,
  };
}
