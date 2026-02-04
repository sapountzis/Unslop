// Statistics endpoint
import { Hono } from 'hono';
import { db } from '../db';
import { userActivity, userUsage, users } from '../db/schema';
import { eq, and, gte, sql, count, desc } from 'drizzle-orm';
import { authMiddleware } from '../middleware/auth';

const stats = new Hono();

// GET /v1/stats - Get user statistics
stats.get('/v1/stats', authMiddleware, async (c) => {
    const user = c.get('user');
    const userId = user.sub;

    const now = new Date();

    // Calculate time boundaries
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

    // Get all-time stats by decision
    const allTimeStats = await db
        .select({
            decision: userActivity.decision,
            count: count(),
        })
        .from(userActivity)
        .where(eq(userActivity.userId, userId))
        .groupBy(userActivity.decision);

    // Get last 30 days stats by decision
    const last30DaysStats = await db
        .select({
            decision: userActivity.decision,
            count: count(),
        })
        .from(userActivity)
        .where(
            and(
                eq(userActivity.userId, userId),
                gte(userActivity.createdAt, thirtyDaysAgo)
            )
        )
        .groupBy(userActivity.decision);

    // Get today's stats by decision
    const todayStats = await db
        .select({
            decision: userActivity.decision,
            count: count(),
        })
        .from(userActivity)
        .where(
            and(
                eq(userActivity.userId, userId),
                gte(userActivity.createdAt, today)
            )
        )
        .groupBy(userActivity.decision);

    // Get daily breakdown for last 30 days (for chart)
    const dailyBreakdown = await db
        .select({
            date: sql<string>`DATE(${userActivity.createdAt})`.as('date'),
            decision: userActivity.decision,
            count: count(),
        })
        .from(userActivity)
        .where(
            and(
                eq(userActivity.userId, userId),
                gte(userActivity.createdAt, thirtyDaysAgo)
            )
        )
        .groupBy(sql`DATE(${userActivity.createdAt})`, userActivity.decision)
        .orderBy(sql`DATE(${userActivity.createdAt})`);

    // Helper to convert stats array to object
    const statsToObject = (statsArray: { decision: string; count: number }[]) => {
        const result = { keep: 0, dim: 0, hide: 0, total: 0 };
        for (const stat of statsArray) {
            const decision = stat.decision as keyof typeof result;
            if (decision in result) {
                result[decision] = stat.count;
                result.total += stat.count;
            }
        }
        return result;
    };

    return c.json({
        all_time: statsToObject(allTimeStats),
        last_30_days: statsToObject(last30DaysStats),
        today: statsToObject(todayStats),
        daily_breakdown: dailyBreakdown,
    });
});

// GET /v1/usage - Get current usage and limits
stats.get('/v1/usage', authMiddleware, async (c) => {
    const user = c.get('user');
    const userId = user.sub;

    const FREE_MONTHLY_LLM_CALLS = parseInt(process.env.FREE_MONTHLY_LLM_CALLS || '300');
    const PRO_MONTHLY_LLM_CALLS = parseInt(process.env.PRO_MONTHLY_LLM_CALLS || '10000');

    // Get user's plan
    const userRecords = await db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

    if (userRecords.length === 0) {
        return c.json({ error: 'User not found' }, 404);
    }

    const userData = userRecords[0];
    const isPro = userData.plan === 'pro' && userData.planStatus === 'active';
    const limit = isPro ? PRO_MONTHLY_LLM_CALLS : FREE_MONTHLY_LLM_CALLS;

    // Get current month's usage
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const monthStartStr = monthStart.toISOString().split('T')[0];

    const usageRecords = await db
        .select()
        .from(userUsage)
        .where(
            and(
                eq(userUsage.userId, userId),
                eq(userUsage.monthStart, monthStartStr)
            )
        )
        .limit(1);

    const currentUsage = usageRecords[0]?.llmCalls || 0;
    const remaining = Math.max(0, limit - currentUsage);

    // Calculate reset date (1st of next month)
    const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

    return c.json({
        current_usage: currentUsage,
        limit: limit,
        remaining: remaining,
        plan: userData.plan,
        plan_status: userData.planStatus,
        reset_date: nextMonth.toISOString(),
    });
});

export { stats };
