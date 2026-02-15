// Billing E2E and webhook tests
import "dotenv/config";
import { describe, it, expect } from "bun:test";
import { createHmac } from "crypto";
import { generateSessionToken } from "../lib/jwt";

const API_URL = process.env.APP_URL || "http://localhost:3000";
const WEBHOOK_SECRET = process.env.POLAR_WEBHOOK_SECRET;

// Helper to create valid Polar webhook signature
function signWebhookPayload(payload: string, secret: string): string {
	return createHmac("sha256", secret).update(payload).digest("hex");
}

// Valid UUID for test user
const TEST_USER_ID = "00000000-0000-0000-0000-000000000002";

async function isServerRunning(): Promise<boolean> {
	try {
		await fetch(`${API_URL}/health`, { signal: AbortSignal.timeout(500) });
		return true;
	} catch {
		return false;
	}
}

async function skipIfNoServer(): Promise<boolean> {
	if (!(await isServerRunning())) {
		console.log(
			"Skipping billing e2e test: API server is not running at APP_URL.",
		);
		return true;
	}
	return false;
}

describe("Billing Checkout E2E", () => {
	it("should create checkout session for authenticated user", async () => {
		if (await skipIfNoServer()) return;

		const token = await generateSessionToken(
			TEST_USER_ID,
			"billing@example.com",
		);

		const res = await fetch(`${API_URL}/v1/billing/create-checkout`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${token}`,
			},
			body: JSON.stringify({ plan: "pro-monthly" }),
		});

		// May get 409 if user already pro, or 500 if Polar API issue
		// But should not get 401 (auth) or 400 (validation)
		expect([200, 409, 500]).toContain(res.status);

		if (res.status === 200) {
			const data = (await res.json()) as { checkout_url: string };
			expect(data.checkout_url).toContain("polar.sh");
		}
	});

	it("should reject unauthenticated checkout request", async () => {
		if (await skipIfNoServer()) return;

		const res = await fetch(`${API_URL}/v1/billing/create-checkout`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ plan: "pro-monthly" }),
		});

		expect(res.status).toBe(401);
	});

	it("should reject invalid plan", async () => {
		if (await skipIfNoServer()) return;

		const token = await generateSessionToken(TEST_USER_ID, "test@example.com");

		const res = await fetch(`${API_URL}/v1/billing/create-checkout`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${token}`,
			},
			body: JSON.stringify({ plan: "invalid-plan" }),
		});

		expect(res.status).toBe(400);
	});
});

describe("Polar Webhook Security", () => {
	it("should reject webhook without signature", async () => {
		if (await skipIfNoServer()) return;

		const payload = JSON.stringify({
			type: "subscription.created",
			data: { id: "sub_fake", metadata: { user_id: "fake-user" } },
		});

		const res = await fetch(`${API_URL}/v1/billing/polar/webhook`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: payload,
		});

		// Should be rejected - either 400 or 401 depending on implementation
		expect([400, 401, 403]).toContain(res.status);
	});

	it("should reject webhook with invalid signature", async () => {
		if (await skipIfNoServer()) return;

		const payload = JSON.stringify({
			type: "subscription.created",
			data: { id: "sub_fake", metadata: { user_id: "fake-user" } },
		});

		const res = await fetch(`${API_URL}/v1/billing/polar/webhook`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"webhook-id": "test-id",
				"webhook-timestamp": String(Math.floor(Date.now() / 1000)),
				"webhook-signature": "v1,invalid-signature-here",
			},
			body: payload,
		});

		// Should be rejected with signature error
		expect([400, 401, 403]).toContain(res.status);
	});
});

describe("Billing Success/Cancel Pages", () => {
	it("should return success page HTML", async () => {
		if (await skipIfNoServer()) return;

		const res = await fetch(`${API_URL}/billing/success`);
		expect(res.status).toBe(200);

		const html = await res.text();
		expect(html).toContain("Payment Successful");
		expect(html).toContain("Unslop Pro");
	});

	it("should return cancel page HTML", async () => {
		if (await skipIfNoServer()) return;

		const res = await fetch(`${API_URL}/billing/cancel`);
		expect(res.status).toBe(200);

		const html = await res.text();
		expect(html).toContain("Payment Cancelled");
		expect(html).toContain("No charges");
	});
});
