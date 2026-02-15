import type { StatsRepository } from "../repositories/stats-repository";
import type { QuotaContextService } from "./quota-context";
import { STATS_LOOKBACK_DAYS } from "../lib/policy-constants";

function toNumber(value: number | string | null | undefined): number {
	if (typeof value === "number") return value;
	if (typeof value === "string") return Number(value) || 0;
	return 0;
}

export interface StatsService {
	getStats: (userId: string) => Promise<{
		all_time: { keep: number; hide: number; total: number };
		last_30_days: { keep: number; hide: number; total: number };
		today: { keep: number; hide: number; total: number };
		daily_breakdown: Array<{ date: string; decision: string; count: number }>;
	}>;
	getUsage: (userId: string) => Promise<
		| {
				found: false;
		  }
		| {
				found: true;
				current_usage: number;
				limit: number;
				remaining: number;
				plan: string;
				plan_status: string;
				reset_date: string;
		  }
	>;
}

export interface StatsServiceDeps {
	statsRepository: StatsRepository;
	quotaContextService: QuotaContextService;
	now?: () => Date;
}

export function createStatsService(deps: StatsServiceDeps): StatsService {
	const now = deps.now ?? (() => new Date());

	async function getStats(userId: string) {
		const current = now();
		const today = new Date(
			Date.UTC(
				current.getUTCFullYear(),
				current.getUTCMonth(),
				current.getUTCDate(),
			),
		);
		const lookbackStart = new Date(
			today.getTime() - STATS_LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
		);

		const summary = (await deps.statsRepository.getSummaryForUser(
			userId,
			today,
			lookbackStart,
		)) || {
			allKeep: 0,
			allHide: 0,
			last30Keep: 0,
			last30Hide: 0,
			todayKeep: 0,
			todayHide: 0,
		};

		const dailyBreakdown = await deps.statsRepository.getDailyBreakdownForUser(
			userId,
			lookbackStart,
		);

		const allKeep = toNumber(summary.allKeep);
		const allHide = toNumber(summary.allHide);
		const last30Keep = toNumber(summary.last30Keep);
		const last30Hide = toNumber(summary.last30Hide);
		const todayKeep = toNumber(summary.todayKeep);
		const todayHide = toNumber(summary.todayHide);

		return {
			all_time: {
				keep: allKeep,
				hide: allHide,
				total: allKeep + allHide,
			},
			last_30_days: {
				keep: last30Keep,
				hide: last30Hide,
				total: last30Keep + last30Hide,
			},
			today: {
				keep: todayKeep,
				hide: todayHide,
				total: todayKeep + todayHide,
			},
			daily_breakdown: dailyBreakdown,
		};
	}

	async function getUsage(userId: string) {
		const context = await deps.quotaContextService.resolveQuotaContext(userId);
		if (!context) {
			return { found: false as const };
		}

		const currentUsage = await deps.statsRepository.getUsageForPeriod(
			userId,
			context.periodStart,
		);
		const remaining = Math.max(0, context.limit - currentUsage);

		return {
			found: true as const,
			current_usage: currentUsage,
			limit: context.limit,
			remaining,
			plan: context.plan,
			plan_status: context.planStatus,
			reset_date: context.resetDate,
		};
	}

	return {
		getStats,
		getUsage,
	};
}
