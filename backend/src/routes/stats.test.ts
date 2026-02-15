import { beforeEach, describe, expect, it, mock } from "bun:test";
import { createTestApp } from "../test-utils/app";
import { generateSessionToken, verifySessionToken } from "../lib/jwt";
import { createAuthMiddleware } from "../middleware/auth";
import { createStatsRoutes } from "./stats";

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-key";

const getStatsMock = mock(async () => ({
	all_time: { keep: 10, hide: 5, total: 15 },
	last_30_days: { keep: 3, hide: 3, total: 6 },
	today: { keep: 1, hide: 1, total: 2 },
	daily_breakdown: [
		{ date: "2026-02-01", decision: "keep", count: 2 },
		{ date: "2026-02-01", decision: "hide", count: 1 },
	],
}));

let usageResult:
	| { found: false }
	| {
			found: true;
			current_usage: number;
			limit: number;
			remaining: number;
			plan: string;
			plan_status: string;
			reset_date: string;
	  } = {
	found: true,
	current_usage: 42,
	limit: 300,
	remaining: 258,
	plan: "free",
	plan_status: "inactive",
	reset_date: "2026-03-15T10:00:00.000Z",
};

const getUsageMock = mock(async () => usageResult);

const app = createTestApp((testApp) => {
	testApp.route(
		"/",
		createStatsRoutes({
			authMiddleware: createAuthMiddleware({ verifySessionToken }),
			statsService: {
				getStats: getStatsMock,
				getUsage: getUsageMock,
			},
		}),
	);
});

describe("Stats Routes (unit)", () => {
	const TEST_USER_ID = "00000000-0000-0000-0000-000000000123";

	beforeEach(() => {
		usageResult = {
			found: true,
			current_usage: 42,
			limit: 300,
			remaining: 258,
			plan: "free",
			plan_status: "inactive",
			reset_date: "2026-03-15T10:00:00.000Z",
		};
		getStatsMock.mockClear();
		getUsageMock.mockClear();
	});

	it("GET /v1/stats returns expected shape", async () => {
		const token = await generateSessionToken(TEST_USER_ID, "stats@example.com");
		const res = await app.request("http://localhost/v1/stats", {
			headers: { Authorization: `Bearer ${token}` },
		});

		expect(res.status).toBe(200);
		expect(getStatsMock).toHaveBeenCalledWith(TEST_USER_ID);
		expect(await res.json()).toEqual({
			all_time: { keep: 10, hide: 5, total: 15 },
			last_30_days: { keep: 3, hide: 3, total: 6 },
			today: { keep: 1, hide: 1, total: 2 },
			daily_breakdown: [
				{ date: "2026-02-01", decision: "keep", count: 2 },
				{ date: "2026-02-01", decision: "hide", count: 1 },
			],
		});
	});

	it("GET /v1/usage rejects unauthenticated request", async () => {
		const res = await app.request("http://localhost/v1/usage");
		expect(res.status).toBe(401);
	});

	it("GET /v1/usage returns usage response", async () => {
		const token = await generateSessionToken(TEST_USER_ID, "stats@example.com");
		const res = await app.request("http://localhost/v1/usage", {
			headers: { Authorization: `Bearer ${token}` },
		});

		expect(res.status).toBe(200);
		expect(getUsageMock).toHaveBeenCalledWith(TEST_USER_ID);

		expect(await res.json()).toEqual({
			current_usage: 42,
			limit: 300,
			remaining: 258,
			plan: "free",
			plan_status: "inactive",
			reset_date: "2026-03-15T10:00:00.000Z",
		});
	});

	it("GET /v1/usage returns 404 when user context is unavailable", async () => {
		usageResult = { found: false };

		const token = await generateSessionToken(TEST_USER_ID, "stats@example.com");
		const res = await app.request("http://localhost/v1/usage", {
			headers: { Authorization: `Bearer ${token}` },
		});

		expect(res.status).toBe(404);
		expect(await res.json()).toEqual({ error: "User not found" });
	});
});
