import { describe, it, beforeAll, afterAll, expect } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { users } from "../src/db/schema";
import { createDependencies } from "../src/app/dependencies";

type IntegrationUser = {
	id: string;
	email: string;
};

describe("Billing integration tests", () => {
	let testUser: IntegrationUser;
	const deps = createDependencies({ db });

	beforeAll(async () => {
		const [user] = await db
			.insert(users)
			.values({
				email: `integration-test-${Date.now()}@example.com`,
				plan: "free",
				planStatus: "inactive",
			})
			.returning({ id: users.id, email: users.email });

		testUser = user;
	});

	afterAll(async () => {
		await db.delete(users).where(eq(users.id, testUser.id));
	});

	it.skipIf(!process.env.POLAR_SANDBOX_ACCESS_TOKEN)(
		"creates checkout session with metadata",
		async () => {
			const session = await deps.services.polar.createCheckoutSession(
				testUser.id,
			);

			expect(session.checkout_url).toContain("polar.sh/checkout/");
			expect(session.checkout_url).toBeTruthy();
		},
	);

	it("handles subscription.active webhook payload", async () => {
		await deps.services.polar.handleSubscriptionActive({
			id: "sub_test_1",
			status: "active",
			customer_id: "cust_test_1",
			metadata: { user_id: testUser.id },
			current_period_start: new Date().toISOString(),
			current_period_end: new Date(
				Date.now() + 30 * 24 * 60 * 60 * 1000,
			).toISOString(),
		});

		const [updatedUser] = await db
			.select()
			.from(users)
			.where(eq(users.id, testUser.id))
			.limit(1);

		expect(updatedUser).toBeDefined();
		expect(updatedUser.plan).toBe("pro");
		expect(updatedUser.planStatus).toBe("active");
		expect(updatedUser.polarCustomerId).toBe("cust_test_1");
		expect(updatedUser.polarSubscriptionId).toBe("sub_test_1");
		expect(updatedUser.subscriptionPeriodStart).toBeInstanceOf(Date);
		expect(updatedUser.subscriptionPeriodEnd).toBeInstanceOf(Date);
	});

	it("handles subscription.canceled webhook payload", async () => {
		await deps.services.polar.handleSubscriptionCanceled({
			id: "sub_test_1",
			status: "canceled",
			customer_id: "cust_test_1",
			metadata: { user_id: testUser.id },
			current_period_end: new Date(
				Date.now() + 30 * 24 * 60 * 60 * 1000,
			).toISOString(),
		});

		const [updatedUser] = await db
			.select()
			.from(users)
			.where(eq(users.id, testUser.id))
			.limit(1);

		expect(updatedUser.planStatus).toBe("canceled");
	});

	it("handles uncancel via explicit uncanceled event", async () => {
		await deps.services.polar.handleSubscriptionUncanceled({
			id: "sub_test_1",
			status: "active",
			customer_id: "cust_test_1",
			metadata: { user_id: testUser.id },
			current_period_start: new Date().toISOString(),
			current_period_end: new Date(
				Date.now() + 30 * 24 * 60 * 60 * 1000,
			).toISOString(),
		});

		const [updatedUser] = await db
			.select()
			.from(users)
			.where(eq(users.id, testUser.id))
			.limit(1);

		expect(updatedUser.planStatus).toBe("active");
	});

	it("ignores webhook payload missing metadata.user_id", async () => {
		await db
			.update(users)
			.set({ plan: "free", planStatus: "inactive" })
			.where(eq(users.id, testUser.id));

		await deps.services.polar.handleSubscriptionActive({
			id: "sub_no_user",
			status: "active",
			customer_id: "cust_no_user",
			metadata: {},
			current_period_start: new Date().toISOString(),
			current_period_end: new Date(
				Date.now() + 30 * 24 * 60 * 60 * 1000,
			).toISOString(),
		});

		const [user] = await db
			.select()
			.from(users)
			.where(eq(users.id, testUser.id))
			.limit(1);

		expect(user.plan).toBe("free");
		expect(user.planStatus).toBe("inactive");
	});
});
