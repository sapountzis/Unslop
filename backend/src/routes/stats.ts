import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";
import type { StatsService } from "../services/stats-service";

export interface StatsRoutesDeps {
	authMiddleware: MiddlewareHandler;
	statsService: StatsService;
}

export function createStatsRoutes(deps: StatsRoutesDeps): Hono {
	const stats = new Hono();

	stats.get("/v1/stats", deps.authMiddleware, async (c) => {
		const user = c.get("user");
		const payload = await deps.statsService.getStats(user.sub);
		return c.json(payload);
	});

	stats.get("/v1/usage", deps.authMiddleware, async (c) => {
		const user = c.get("user");
		const usage = await deps.statsService.getUsage(user.sub);

		if (!usage.found) {
			return c.json({ error: "User not found" }, 404);
		}

		return c.json({
			current_usage: usage.current_usage,
			limit: usage.limit,
			remaining: usage.remaining,
			plan: usage.plan,
			plan_status: usage.plan_status,
			reset_date: usage.reset_date,
		});
	});

	return stats;
}
