import { describe, expect, it, mock } from "bun:test";
import { Plan, PlanStatus } from "../lib/billing-constants";
import { createQuotaContextService } from "./quota-context";

interface QuotaUserRecord {
	plan: string;
	planStatus: string;
	createdAt: Date;
	subscriptionPeriodStart: Date | null;
	subscriptionPeriodEnd: Date | null;
}

function buildService(userRecord: QuotaUserRecord | null, nowIso: string) {
	const selectMock = mock(() => ({
		from: mock(() => ({
			where: mock(() => ({
				limit: mock(async () => (userRecord ? [userRecord] : [])),
			})),
		})),
	}));

	const service = createQuotaContextService({
		db: {
			select: selectMock,
		} as never,
		quotas: {
			freeMonthlyLlmCalls: 300,
			proMonthlyLlmCalls: 10000,
		},
		now: () => new Date(nowIso),
	});

	return { service, selectMock };
}

describe("quota context period anchors", () => {
	it("anchors free plan periods to account creation date each month", async () => {
		const { service } = buildService(
			{
				plan: Plan.FREE,
				planStatus: PlanStatus.INACTIVE,
				createdAt: new Date("2026-01-15T10:00:00.000Z"),
				subscriptionPeriodStart: null,
				subscriptionPeriodEnd: null,
			},
			"2026-02-20T12:00:00.000Z",
		);

		const context = await service.resolveQuotaContext("user-1");

		expect(context).not.toBeNull();
		expect(context?.isPro).toBe(false);
		expect(context?.limit).toBe(300);
		expect(context?.periodStart).toBe("2026-02-15");
		expect(context?.resetDate).toBe("2026-03-15T10:00:00.000Z");
	});

	it("clamps free anchor day for shorter months", async () => {
		const { service } = buildService(
			{
				plan: Plan.FREE,
				planStatus: PlanStatus.INACTIVE,
				createdAt: new Date("2026-01-31T08:30:00.000Z"),
				subscriptionPeriodStart: null,
				subscriptionPeriodEnd: null,
			},
			"2026-02-20T12:00:00.000Z",
		);

		const context = await service.resolveQuotaContext("user-1");

		expect(context).not.toBeNull();
		expect(context?.periodStart).toBe("2026-01-31");
		expect(context?.resetDate).toBe("2026-02-28T08:30:00.000Z");
	});

	it("uses subscription lifecycle window for active pro users", async () => {
		const { service } = buildService(
			{
				plan: Plan.PRO,
				planStatus: PlanStatus.ACTIVE,
				createdAt: new Date("2026-01-15T10:00:00.000Z"),
				subscriptionPeriodStart: new Date("2026-02-10T00:00:00.000Z"),
				subscriptionPeriodEnd: new Date("2026-03-10T00:00:00.000Z"),
			},
			"2026-02-20T12:00:00.000Z",
		);

		const context = await service.resolveQuotaContext("user-1");

		expect(context).not.toBeNull();
		expect(context?.isPro).toBe(true);
		expect(context?.limit).toBe(10000);
		expect(context?.periodStart).toBe("2026-02-10");
		expect(context?.resetDate).toBe("2026-03-10T00:00:00.000Z");
	});

	it("keeps pro quota for canceled subscriptions until period end", async () => {
		const { service } = buildService(
			{
				plan: Plan.PRO,
				planStatus: PlanStatus.CANCELED,
				createdAt: new Date("2026-01-15T10:00:00.000Z"),
				subscriptionPeriodStart: new Date("2026-02-10T00:00:00.000Z"),
				subscriptionPeriodEnd: new Date("2026-03-10T00:00:00.000Z"),
			},
			"2026-02-20T12:00:00.000Z",
		);

		const context = await service.resolveQuotaContext("user-1");

		expect(context).not.toBeNull();
		expect(context?.isPro).toBe(true);
		expect(context?.limit).toBe(10000);
		expect(context?.periodStart).toBe("2026-02-10");
		expect(context?.resetDate).toBe("2026-03-10T00:00:00.000Z");
	});

	it("falls back to free account-anchor window when pro access is no longer active", async () => {
		const { service } = buildService(
			{
				plan: Plan.PRO,
				planStatus: PlanStatus.PAST_DUE,
				createdAt: new Date("2026-01-15T10:00:00.000Z"),
				subscriptionPeriodStart: new Date("2026-02-10T00:00:00.000Z"),
				subscriptionPeriodEnd: new Date("2026-02-18T00:00:00.000Z"),
			},
			"2026-02-20T12:00:00.000Z",
		);

		const context = await service.resolveQuotaContext("user-1");

		expect(context).not.toBeNull();
		expect(context?.isPro).toBe(false);
		expect(context?.limit).toBe(300);
		expect(context?.periodStart).toBe("2026-02-15");
		expect(context?.resetDate).toBe("2026-03-15T10:00:00.000Z");
	});
});
