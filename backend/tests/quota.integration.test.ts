import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { and, eq } from "drizzle-orm";
import { db } from "../src/db";
import { createDependencies } from "../src/app/dependencies";
import { userUsage, users } from "../src/db/schema";

type IntegrationUser = {
	id: string;
};

describe("Quota integration tests", () => {
	const deps = createDependencies({ db });
	let testUser: IntegrationUser;

	beforeAll(async () => {
		const [user] = await db
			.insert(users)
			.values({
				email: `quota-integration-${Date.now()}@example.com`,
				plan: "pro",
				planStatus: "active",
				subscriptionPeriodStart: new Date("2026-02-15T10:00:00.000Z"),
				subscriptionPeriodEnd: new Date("2026-03-15T10:00:00.000Z"),
			})
			.returning({ id: users.id });

		testUser = user;
	});

	afterAll(async () => {
		await db.delete(users).where(eq(users.id, testUser.id));
	});

	it("consumes quota using subscription activation date as period start", async () => {
		const result = await deps.services.quota.tryConsumeQuota(testUser.id, 1);

		expect(result.allowed).toBe(true);
		expect(result.periodStart).toBe("2026-02-15");

		const usageRows = await db
			.select({ llmCalls: userUsage.llmCalls })
			.from(userUsage)
			.where(
				and(
					eq(userUsage.userId, testUser.id),
					eq(userUsage.monthStart, "2026-02-15"),
				),
			)
			.limit(1);

		expect(usageRows[0]?.llmCalls).toBe(1);
	});
});
