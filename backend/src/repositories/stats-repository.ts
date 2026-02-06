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

  async function countByDecisionForRange(
    userId: string,
    createdAtGte?: Date,
  ): Promise<Record<'keep' | 'dim' | 'hide', number>> {
    const whereClause = createdAtGte
      ? and(eq(userActivity.userId, userId), gte(userActivity.createdAt, createdAtGte))
      : eq(userActivity.userId, userId);

    const rows = await db
      .select({
        decision: userActivity.decision,
        count: count(),
      })
      .from(userActivity)
      .where(whereClause)
      .groupBy(userActivity.decision);

    const result: Record<'keep' | 'dim' | 'hide', number> = {
      keep: 0,
      dim: 0,
      hide: 0,
    };

    for (const row of rows) {
      if (row.decision === 'keep' || row.decision === 'dim' || row.decision === 'hide') {
        result[row.decision] = Number(row.count) || 0;
      }
    }

    return result;
  }

  async function getSummaryForUser(userId: string, today: Date, lookbackStart: Date): Promise<StatsSummaryRow | null> {
    const [allTime, last30, todayCounts] = await Promise.all([
      countByDecisionForRange(userId),
      countByDecisionForRange(userId, lookbackStart),
      countByDecisionForRange(userId, today),
    ]);

    return {
      allKeep: allTime.keep,
      allDim: allTime.dim,
      allHide: allTime.hide,
      last30Keep: last30.keep,
      last30Dim: last30.dim,
      last30Hide: last30.hide,
      todayKeep: todayCounts.keep,
      todayDim: todayCounts.dim,
      todayHide: todayCounts.hide,
    };
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
