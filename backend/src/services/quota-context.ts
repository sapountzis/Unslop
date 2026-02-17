import { eq } from "drizzle-orm";
import { users } from "../db/schema";
import type { Database } from "../db";
import { Plan, PlanStatus } from "../lib/billing-constants";

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

interface MonthlyWindow {
	periodStart: string;
	resetDate: string;
}

function getDaysInUtcMonth(year: number, month: number): number {
	return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

function shiftUtcMonth(
	year: number,
	month: number,
	delta: number,
): { year: number; month: number } {
	const totalMonths = year * 12 + month + delta;
	const shiftedYear = Math.floor(totalMonths / 12);
	const shiftedMonth = ((totalMonths % 12) + 12) % 12;
	return { year: shiftedYear, month: shiftedMonth };
}

function buildAnchoredUtcDate(anchor: Date, year: number, month: number): Date {
	const clampedDay = Math.min(
		anchor.getUTCDate(),
		getDaysInUtcMonth(year, month),
	);

	return new Date(
		Date.UTC(
			year,
			month,
			clampedDay,
			anchor.getUTCHours(),
			anchor.getUTCMinutes(),
			anchor.getUTCSeconds(),
			anchor.getUTCMilliseconds(),
		),
	);
}

function toPeriodStartString(date: Date): string {
	return date.toISOString().split("T")[0];
}

function resolveMonthlyWindowFromAnchor(
	anchor: Date,
	now: Date,
): MonthlyWindow {
	const currentMonthAnchor = buildAnchoredUtcDate(
		anchor,
		now.getUTCFullYear(),
		now.getUTCMonth(),
	);
	const previousMonth = shiftUtcMonth(
		now.getUTCFullYear(),
		now.getUTCMonth(),
		-1,
	);

	const periodStartDate =
		now.getTime() >= currentMonthAnchor.getTime()
			? currentMonthAnchor
			: buildAnchoredUtcDate(anchor, previousMonth.year, previousMonth.month);

	const normalizedPeriodStart =
		periodStartDate.getTime() < anchor.getTime() ? anchor : periodStartDate;

	const nextMonth = shiftUtcMonth(
		normalizedPeriodStart.getUTCFullYear(),
		normalizedPeriodStart.getUTCMonth(),
		1,
	);
	const resetDate = buildAnchoredUtcDate(
		anchor,
		nextMonth.year,
		nextMonth.month,
	);

	return {
		periodStart: toPeriodStartString(normalizedPeriodStart),
		resetDate: resetDate.toISOString(),
	};
}

function resolveNextMonthlyAnchor(anchor: Date): string {
	const nextMonth = shiftUtcMonth(
		anchor.getUTCFullYear(),
		anchor.getUTCMonth(),
		1,
	);
	return buildAnchoredUtcDate(
		anchor,
		nextMonth.year,
		nextMonth.month,
	).toISOString();
}

export function createQuotaContextService(
	deps: QuotaContextDeps,
): QuotaContextService {
	const now = deps.now ?? (() => new Date());

	async function resolveQuotaContext(
		userId: string,
	): Promise<QuotaContext | null> {
		const userRecords = await deps.db
			.select({
				plan: users.plan,
				planStatus: users.planStatus,
				createdAt: users.createdAt,
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
		const current = now();
		const subscriptionPeriodEnd = user.subscriptionPeriodEnd;
		const hasCanceledGraceAccess =
			user.planStatus === PlanStatus.CANCELED &&
			subscriptionPeriodEnd !== null &&
			subscriptionPeriodEnd.getTime() > current.getTime();
		const keepsProAccess =
			user.plan === Plan.PRO &&
			(user.planStatus === PlanStatus.ACTIVE || hasCanceledGraceAccess);

		const isPro = keepsProAccess;
		const limit = isPro
			? deps.quotas.proMonthlyLlmCalls
			: deps.quotas.freeMonthlyLlmCalls;

		let window: MonthlyWindow;
		if (keepsProAccess && user.subscriptionPeriodStart) {
			window = {
				periodStart: toPeriodStartString(user.subscriptionPeriodStart),
				resetDate: user.subscriptionPeriodEnd
					? user.subscriptionPeriodEnd.toISOString()
					: resolveNextMonthlyAnchor(user.subscriptionPeriodStart),
			};
		} else {
			window = resolveMonthlyWindowFromAnchor(user.createdAt, current);
		}

		return {
			plan: user.plan,
			planStatus: user.planStatus,
			isPro,
			limit,
			periodStart: window.periodStart,
			resetDate: window.resetDate,
		};
	}

	return {
		resolveQuotaContext,
	};
}
