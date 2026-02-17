import { and, eq, sql } from "drizzle-orm";
import { userUsage } from "../db/schema";
import type { Database } from "../db";
import type { QuotaContextService } from "./quota-context";

export interface QuotaCheckResult {
	allowed: boolean;
	currentUsage: number;
	limit: number;
	plan: string;
}

export interface QuotaStatus extends QuotaCheckResult {
	remaining: number;
	periodStart: string;
	isPro: boolean;
}

export interface QuotaService {
	getQuotaStatus: (userId: string) => Promise<QuotaStatus>;
	checkQuota: (userId: string) => Promise<QuotaCheckResult>;
	incrementUsageBy: (
		userId: string,
		count: number,
		periodStart?: string,
	) => Promise<void>;
	incrementUsage: (userId: string) => Promise<void>;
}

export interface QuotaServiceDeps {
	db: Database;
	quotaContextService: QuotaContextService;
}

export function createQuotaService(deps: QuotaServiceDeps): QuotaService {
	const { db, quotaContextService } = deps;

	async function getQuotaStatus(userId: string): Promise<QuotaStatus> {
		const context = await quotaContextService.resolveQuotaContext(userId);
		if (!context) {
			return {
				allowed: false,
				currentUsage: 0,
				limit: 0,
				plan: "unknown",
				remaining: 0,
				periodStart: "",
				isPro: false,
			};
		}

		const usageRecords = await db
			.select({ llmCalls: userUsage.llmCalls })
			.from(userUsage)
			.where(
				and(
					eq(userUsage.userId, userId),
					eq(userUsage.monthStart, context.periodStart),
				),
			)
			.limit(1);

		const currentUsage = usageRecords[0]?.llmCalls || 0;
		const remaining = Math.max(0, context.limit - currentUsage);

		return {
			allowed: currentUsage < context.limit,
			currentUsage,
			limit: context.limit,
			plan: context.plan,
			remaining,
			periodStart: context.periodStart,
			isPro: context.isPro,
		};
	}

	async function checkQuota(userId: string): Promise<QuotaCheckResult> {
		const status = await getQuotaStatus(userId);
		return {
			allowed: status.allowed,
			currentUsage: status.currentUsage,
			limit: status.limit,
			plan: status.plan,
		};
	}

	async function incrementUsageBy(
		userId: string,
		count: number,
		periodStart?: string,
	): Promise<void> {
		if (count <= 0) return;

		let periodStartStr = periodStart;
		if (!periodStartStr) {
			const context = await quotaContextService.resolveQuotaContext(userId);
			if (!context) return;
			periodStartStr = context.periodStart;
		}

		await db
			.insert(userUsage)
			.values({
				userId,
				monthStart: periodStartStr,
				llmCalls: count,
			})
			.onConflictDoUpdate({
				target: [userUsage.userId, userUsage.monthStart],
				set: {
					llmCalls: sql`${userUsage.llmCalls} + ${count}`,
				},
			});
	}

	async function incrementUsage(userId: string): Promise<void> {
		await incrementUsageBy(userId, 1);
	}

	return {
		getQuotaStatus,
		checkQuota,
		incrementUsageBy,
		incrementUsage,
	};
}
