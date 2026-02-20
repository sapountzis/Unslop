import { describe, expect, it, mock } from "bun:test";
import { createApp } from "./create-app";
import type { AppDependencies } from "./dependencies";
import { createQuotaContextService } from "../services/quota-context";

type AppDependencyOverrides = Omit<Partial<AppDependencies>, "services"> & {
	services?: Partial<AppDependencies["services"]>;
};
type ClassifyBatchStreamFn =
	AppDependencies["services"]["classification"]["classifyBatchStream"];

function makeDeps(overrides: AppDependencyOverrides = {}): AppDependencies {
	const classifySingle = mock(async () => ({
		post_id: "p1",
		decision: "keep" as const,
		source: "llm" as const,
	}));
	const classifyBatchStream = mock(
		(async (_userId, _posts, _onOutcome) => undefined) as ClassifyBatchStreamFn,
	);
	const getStats = mock(async () => ({
		all_time: { keep: 0, hide: 0, total: 0 },
		last_30_days: { keep: 0, hide: 0, total: 0 },
		today: { keep: 0, hide: 0, total: 0 },
		daily_breakdown: [],
	}));
	const getUsage = mock(async () => ({
		found: true as const,
		current_usage: 0,
		limit: 300,
		remaining: 300,
		plan: "free",
		plan_status: "inactive",
		reset_date: "2026-03-01T00:00:00.000Z",
	}));

	const base: AppDependencies = {
		config: {
			testMode: true,
			server: { nodeEnv: "test", port: 3000, appUrl: "http://localhost:3000" },
			db: { url: "postgresql://local" },
			llm: { apiKey: "", textModel: "", vlmModel: "", baseUrl: "" },
			billing: {
				polarEnv: "sandbox",
				polarApiKey: "",
				polarWebhookSecret: "whsec",
				polarProductId: "",
				polarApiBase: "https://sandbox-api.polar.sh",
			},
			quotas: { freeMonthlyLlmCalls: 300, proMonthlyLlmCalls: 10000 },
			auth: { jwtSecret: "test-secret" },
			email: {
				resendApiKey: "",
				magicLinkBaseUrl: "http://localhost/callback",
				logMagicLinkUrls: false,
			},
			classification: { batchConcurrency: 4 },
		},
		db: {} as never,
		logger: {
			info: mock(() => undefined),
			warn: mock(() => undefined),
			error: mock(() => undefined),
		},
		authMiddleware: async (c, next) => {
			c.set("user", {
				sub: "user-1",
				email: "user@example.com",
				iat: 0,
				exp: 0,
			});
			await next();
		},
		services: {
			classification: {
				classifySingle,
				classifyBatchStream,
			},
			auth: {
				startAuth: mock(async () => undefined),
				completeMagicLink: mock(async () => ({ sessionToken: "token" })),
				getCurrentUser: mock(async () => ({
					id: "user-1",
					email: "user@example.com",
					plan: "free",
					planStatus: "inactive",
				})),
			},
			feedback: {
				submitFeedback: mock(async () => "ok" as const),
			},
			stats: {
				getStats,
				getUsage,
			},
			polar: {
				createCheckoutSession: mock(async () => ({
					checkout_url: "https://polar/checkout",
				})),
				syncUserSubscriptionByEmail: mock(async () => undefined),
				buildWebhookDeliveryKey: mock(() => "k"),
				claimWebhookDeliveryById: mock(async () => ({
					webhookId: "wh",
					isDuplicate: false,
				})),
				releaseWebhookDeliveryById: mock(async () => undefined),
				claimWebhookDelivery: mock(async () => ({
					webhookId: "wh",
					isDuplicate: false,
				})),
				handleSubscriptionActive: mock(async () => undefined),
				handleSubscriptionCanceled: mock(async () => undefined),
				handleSubscriptionUncanceled: mock(async () => undefined),
				handleSubscriptionRevoked: mock(async () => undefined),
				handleSubscriptionPastDue: mock(async () => undefined),
				handleSubscriptionUpdated: mock(async () => undefined),
			},
			quota: {
				getQuotaStatus: mock(async () => ({
					allowed: true,
					currentUsage: 0,
					limit: 300,
					plan: "free",
					remaining: 300,
					periodStart: "2026-02-01",
					isPro: false,
				})),
				checkQuota: mock(async () => ({
					allowed: true,
					currentUsage: 0,
					limit: 300,
					plan: "free",
				})),
				incrementUsageBy: mock(async () => undefined),
				incrementUsage: mock(async () => undefined),
			},
			quotaContext: {
				resolveQuotaContext: mock(async () => ({
					plan: "free",
					planStatus: "inactive",
					isPro: false,
					limit: 300,
					periodStart: "2026-02-01",
					resetDate: "2026-03-01T00:00:00.000Z",
				})),
			},
			llm: {
				classifyPost: mock(async () => ({
					scores: null,
					source: "error" as const,
					model: "dev",
					latency: 0,
				})),
			},
		},
	};

	return {
		...base,
		...overrides,
		services: {
			...base.services,
			...(overrides.services ?? {}),
		},
	};
}

describe("app dependency wiring", () => {
	it("creates an app with injected dependencies", async () => {
		const app = createApp(makeDeps());
		const res = await app.request("http://localhost/health");

		expect(res.status).toBe(200);
		expect(await res.json()).toEqual(
			expect.objectContaining({
				status: "ok",
				version: "0.1.0",
			}),
		);
	});

	it("routes call injected service functions", async () => {
		const classifySingle = mock(async () => ({
			post_id: "svc-1",
			decision: "keep" as const,
			source: "llm" as const,
		}));
		const app = createApp(
			makeDeps({
				services: {
					classification: {
						classifySingle,
						classifyBatchStream: mock(
							(async (_userId, _posts, _onOutcome) =>
								undefined) as ClassifyBatchStreamFn,
						),
					},
				} as Partial<AppDependencies["services"]>,
			}),
		);

		const res = await app.request("http://localhost/v1/classify", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				post: {
					post_id: "svc-1",
					text: "text",
					attachments: [],
				},
			}),
		});

		expect(res.status).toBe(200);
		expect(classifySingle).toHaveBeenCalledWith(
			"user-1",
			expect.objectContaining({ post_id: "svc-1" }),
		);
	});

	it("supports clock-dependent logic via injected now function", async () => {
		const selectMock = mock(() => ({
			from: mock(() => ({
				where: mock(() => ({
					limit: mock(async () => [
						{
							plan: "free",
							planStatus: "inactive",
							createdAt: new Date("2026-01-15T00:00:00.000Z"),
							subscriptionPeriodStart: null,
							subscriptionPeriodEnd: null,
						},
					]),
				})),
			})),
		}));

		const service = createQuotaContextService({
			db: {
				select: selectMock,
			} as unknown as AppDependencies["db"],
			quotas: {
				freeMonthlyLlmCalls: 300,
				proMonthlyLlmCalls: 10000,
			},
			now: () => new Date("2026-04-15T12:00:00.000Z"),
		});

		const context = await service.resolveQuotaContext("user-1");

		expect(context).not.toBeNull();
		expect(context?.periodStart).toBe("2026-04-15");
		expect(context?.resetDate).toBe("2026-05-15T00:00:00.000Z");
	});
});
