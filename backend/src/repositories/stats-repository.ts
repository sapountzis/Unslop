import { and, count, eq, gte, sql } from 'drizzle-orm';
import { userActivity, userUsage } from '../db/schema';
import type { Database } from '../db';

export interface StatsSummaryRow {
  allKeep: number | string | null;
  allDim: number | string | null;
  allHide: number | string | null;
  last30Keep: number | string | null;
  last30Dim: number | string | null;
  last30Hide: number | string | null;
  todayKeep: number | string | null;
  todayDim: number | string | null;
  todayHide: number | string | null;
}

export interface DailyBreakdownRow {
  date: string;
  decision: string;
  count: number;
}

export interface StatsRepository {
  getSummaryForUser: (userId: string, today: Date, lookbackStart: Date) => Promise<StatsSummaryRow | null>;
  getDailyBreakdownForUser: (userId: string, lookbackStart: Date) => Promise<DailyBreakdownRow[]>;
  getUsageForPeriod: (userId: string, periodStart: string) => Promise<number>;
}

export interface StatsRepositoryDeps {
  db: Database;
}

export function createStatsRepository(deps: StatsRepositoryDeps): StatsRepository {
  const { db } = deps;

  async function getSummaryForUser(userId: string, today: Date, lookbackStart: Date): Promise<StatsSummaryRow | null> {
    const rows = await db
      .select({
        allKeep: sql<number>`COALESCE(COUNT(*) FILTER (WHERE ${userActivity.decision} = 'keep')::int, 0)`,
        allDim: sql<number>`COALESCE(COUNT(*) FILTER (WHERE ${userActivity.decision} = 'dim')::int, 0)`,
        allHide: sql<number>`COALESCE(COUNT(*) FILTER (WHERE ${userActivity.decision} = 'hide')::int, 0)`,
        last30Keep:
          sql<number>`COALESCE(COUNT(*) FILTER (WHERE ${userActivity.decision} = 'keep' AND ${userActivity.createdAt} >= ${lookbackStart})::int, 0)`,
        last30Dim:
          sql<number>`COALESCE(COUNT(*) FILTER (WHERE ${userActivity.decision} = 'dim' AND ${userActivity.createdAt} >= ${lookbackStart})::int, 0)`,
        last30Hide:
          sql<number>`COALESCE(COUNT(*) FILTER (WHERE ${userActivity.decision} = 'hide' AND ${userActivity.createdAt} >= ${lookbackStart})::int, 0)`,
        todayKeep:
          sql<number>`COALESCE(COUNT(*) FILTER (WHERE ${userActivity.decision} = 'keep' AND ${userActivity.createdAt} >= ${today})::int, 0)`,
        todayDim:
          sql<number>`COALESCE(COUNT(*) FILTER (WHERE ${userActivity.decision} = 'dim' AND ${userActivity.createdAt} >= ${today})::int, 0)`,
        todayHide:
          sql<number>`COALESCE(COUNT(*) FILTER (WHERE ${userActivity.decision} = 'hide' AND ${userActivity.createdAt} >= ${today})::int, 0)`,
      })
      .from(userActivity)
      .where(eq(userActivity.userId, userId))
      .limit(1);

    return rows[0] ?? null;
  }

  async function getDailyBreakdownForUser(userId: string, lookbackStart: Date): Promise<DailyBreakdownRow[]> {
    return db
      .select({
        date: sql<string>`DATE(${userActivity.createdAt})`.as('date'),
        decision: userActivity.decision,
        count: count(),
      })
      .from(userActivity)
      .where(and(eq(userActivity.userId, userId), gte(userActivity.createdAt, lookbackStart)))
      .groupBy(sql`DATE(${userActivity.createdAt})`, userActivity.decision)
      .orderBy(sql`DATE(${userActivity.createdAt})`);
  }

  async function getUsageForPeriod(userId: string, periodStart: string): Promise<number> {
    const rows = await db
      .select({ llmCalls: userUsage.llmCalls })
      .from(userUsage)
      .where(and(eq(userUsage.userId, userId), eq(userUsage.monthStart, periodStart)))
      .limit(1);

    return rows[0]?.llmCalls ?? 0;
  }

  return {
    getSummaryForUser,
    getDailyBreakdownForUser,
    getUsageForPeriod,
  };
}
