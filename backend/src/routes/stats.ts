import { Hono } from 'hono';
import { and, count, eq, gte, sql } from 'drizzle-orm';
import { db } from '../db';
import { userActivity, userUsage } from '../db/schema';
import { authMiddleware } from '../middleware/auth';
import { resolveQuotaContext } from '../services/quota-context';

const stats = new Hono();

function toNumber(value: number | string | null | undefined): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number(value) || 0;
  return 0;
}

stats.get('/v1/stats', authMiddleware, async (c) => {
  const user = c.get('user');
  const userId = user.sub;

  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

  const summaryRows = await db
    .select({
      allKeep: sql<number>`COALESCE(COUNT(*) FILTER (WHERE ${userActivity.decision} = 'keep')::int, 0)`,
      allDim: sql<number>`COALESCE(COUNT(*) FILTER (WHERE ${userActivity.decision} = 'dim')::int, 0)`,
      allHide: sql<number>`COALESCE(COUNT(*) FILTER (WHERE ${userActivity.decision} = 'hide')::int, 0)`,
      last30Keep:
        sql<number>`COALESCE(COUNT(*) FILTER (WHERE ${userActivity.decision} = 'keep' AND ${userActivity.createdAt} >= ${thirtyDaysAgo})::int, 0)`,
      last30Dim:
        sql<number>`COALESCE(COUNT(*) FILTER (WHERE ${userActivity.decision} = 'dim' AND ${userActivity.createdAt} >= ${thirtyDaysAgo})::int, 0)`,
      last30Hide:
        sql<number>`COALESCE(COUNT(*) FILTER (WHERE ${userActivity.decision} = 'hide' AND ${userActivity.createdAt} >= ${thirtyDaysAgo})::int, 0)`,
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

  const summary = summaryRows[0] || {
    allKeep: 0,
    allDim: 0,
    allHide: 0,
    last30Keep: 0,
    last30Dim: 0,
    last30Hide: 0,
    todayKeep: 0,
    todayDim: 0,
    todayHide: 0,
  };

  const dailyBreakdown = await db
    .select({
      date: sql<string>`DATE(${userActivity.createdAt})`.as('date'),
      decision: userActivity.decision,
      count: count(),
    })
    .from(userActivity)
    .where(and(eq(userActivity.userId, userId), gte(userActivity.createdAt, thirtyDaysAgo)))
    .groupBy(sql`DATE(${userActivity.createdAt})`, userActivity.decision)
    .orderBy(sql`DATE(${userActivity.createdAt})`);

  const allKeep = toNumber(summary.allKeep);
  const allDim = toNumber(summary.allDim);
  const allHide = toNumber(summary.allHide);
  const last30Keep = toNumber(summary.last30Keep);
  const last30Dim = toNumber(summary.last30Dim);
  const last30Hide = toNumber(summary.last30Hide);
  const todayKeep = toNumber(summary.todayKeep);
  const todayDim = toNumber(summary.todayDim);
  const todayHide = toNumber(summary.todayHide);

  return c.json({
    all_time: {
      keep: allKeep,
      dim: allDim,
      hide: allHide,
      total: allKeep + allDim + allHide,
    },
    last_30_days: {
      keep: last30Keep,
      dim: last30Dim,
      hide: last30Hide,
      total: last30Keep + last30Dim + last30Hide,
    },
    today: {
      keep: todayKeep,
      dim: todayDim,
      hide: todayHide,
      total: todayKeep + todayDim + todayHide,
    },
    daily_breakdown: dailyBreakdown,
  });
});

stats.get('/v1/usage', authMiddleware, async (c) => {
  const user = c.get('user');
  const userId = user.sub;

  const context = await resolveQuotaContext(userId);
  if (!context) {
    return c.json({ error: 'User not found' }, 404);
  }

  const usageRecords = await db
    .select({ llmCalls: userUsage.llmCalls })
    .from(userUsage)
    .where(and(eq(userUsage.userId, userId), eq(userUsage.monthStart, context.periodStart)))
    .limit(1);

  const currentUsage = usageRecords[0]?.llmCalls || 0;
  const remaining = Math.max(0, context.limit - currentUsage);

  return c.json({
    current_usage: currentUsage,
    limit: context.limit,
    remaining,
    plan: context.plan,
    plan_status: context.planStatus,
    reset_date: context.resetDate,
  });
});

export { stats };
