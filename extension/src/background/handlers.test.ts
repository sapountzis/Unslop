// extension/src/background/handlers.test.ts
import { describe, expect, it } from "bun:test";
import { MESSAGE_TYPES, type RuntimeRequest } from "../lib/messages";
import type { LocalStatsSnapshot, PostData, ProviderSettings } from "../types";
import { createBackgroundMessageHandlers } from "./handlers";
import type { DiagnosticsEngine } from "./diagnosticsEngine";
import type { LocalStatsStore } from "./localStatsStore";
import type { ProviderPermissionResult } from "./providerPermissions";
import type { StorageFacade } from "./storageFacade";

type MessageSender = chrome.runtime.MessageSender;

function createPost(postId: string): PostData {
	return {
		post_id: postId,
		text: postId,
		attachments: [],
	};
}

const DEFAULT_SETTINGS: ProviderSettings = {
	apiKey: "sk-test",
	baseUrl: "https://api.openai.com",
	model: "gpt-4.1-mini",
};

const DEFAULT_LOCAL_STATS: LocalStatsSnapshot = {
	today: { keep: 0, hide: 0, total: 0 },
	last30Days: { keep: 0, hide: 0, total: 0 },
	allTime: { keep: 0, hide: 0, total: 0 },
	dailyBreakdown: [],
};

function createStorageFacadeMock(
	overrides: Partial<StorageFacade> = {},
): StorageFacade {
	return {
		getProviderSettings: async () => DEFAULT_SETTINGS,
		setProviderSettings: async () => { },
		hasApiKey: async () => true,
		getEnabled: async () => true,
		toggleEnabled: async () => false,
		getDevMode: async () => true,
		toggleDevMode: async () => false,
		...overrides,
	};
}

function createLocalStatsStoreMock(
	overrides: Partial<LocalStatsStore> = {},
): LocalStatsStore {
	return {
		getLocalStats: async () => DEFAULT_LOCAL_STATS,
		incrementDecision: async () => {},
		...overrides,
	};
}

describe("background handlers", () => {
	it("returns disabled classify response when no API key is configured", async () => {
		const handlers = createBackgroundMessageHandlers({
			storageFacade: createStorageFacadeMock({
				hasApiKey: async () => false,
			}),
			localStatsStore: createLocalStatsStoreMock(),
		});
		const handler = handlers[MESSAGE_TYPES.CLASSIFY_BATCH];
		if (!handler) throw new Error("classify handler missing");

		const response = await handler(
			{
				type: MESSAGE_TYPES.CLASSIFY_BATCH,
				posts: [createPost("post-1")],
			} as RuntimeRequest,
			{ tab: { id: 7 } } as MessageSender,
		);

		expect(response).toEqual({ status: "disabled" });
	});

	it("returns disabled classify response when extension is toggled off", async () => {
		const handlers = createBackgroundMessageHandlers({
			storageFacade: createStorageFacadeMock({
				hasApiKey: async () => true,
				getEnabled: async () => false,
			}),
			localStatsStore: createLocalStatsStoreMock(),
		});
		const handler = handlers[MESSAGE_TYPES.CLASSIFY_BATCH];
		if (!handler) throw new Error("classify handler missing");

		const response = await handler(
			{
				type: MESSAGE_TYPES.CLASSIFY_BATCH,
				posts: [createPost("post-1")],
			} as RuntimeRequest,
			{ tab: { id: 7 } } as MessageSender,
		);

		expect(response).toEqual({ status: "disabled" });
	});

	it("returns ok and streams classify items back to sender tab", async () => {
		const tabMessages: Array<{ tabId: number; message: unknown }> = [];
		const incrementedDecisions: Array<"keep" | "hide"> = [];

		const fakeStreamFn = async (
			posts: PostData[],
			_settings: ProviderSettings,
			onItem: (item: { post_id: string; decision: string; source: string }) => void,
		) => {
			for (const post of posts) {
				onItem({ post_id: post.post_id, decision: "hide", source: "llm" });
			}
		};

		const handlers = createBackgroundMessageHandlers({
			storageFacade: createStorageFacadeMock(),
			classificationService: {
				classifyBatch(posts, settings, tabId, onResult) {
					void fakeStreamFn(posts, settings, (item) => {
						if (onResult) {
							void onResult(item as { post_id: string; decision?: "keep" | "hide" });
						}
						tabMessages.push({
							tabId,
							message: {
								type: MESSAGE_TYPES.CLASSIFY_BATCH_RESULT,
								item,
							},
						});
					});
				},
			} as any,
			localStatsStore: createLocalStatsStoreMock({
				incrementDecision: async (decision) => {
					incrementedDecisions.push(decision);
				},
			}),
		});
		const handler = handlers[MESSAGE_TYPES.CLASSIFY_BATCH];
		if (!handler) throw new Error("classify handler missing");

		const response = await handler(
			{
				type: MESSAGE_TYPES.CLASSIFY_BATCH,
				posts: [createPost("post-1"), createPost("post-2")],
			} as RuntimeRequest,
			{ tab: { id: 9 } } as MessageSender,
		);

		expect(response).toEqual({ status: "ok" });
		// Messages are sent async; give microtask queue time to drain
		await new Promise((r) => setTimeout(r, 10));
		expect(tabMessages).toHaveLength(2);
		expect(incrementedDecisions).toEqual(["hide", "hide"]);
	});

	it("returns provider settings when GET_PROVIDER_SETTINGS is called", async () => {
		const handlers = createBackgroundMessageHandlers({
			storageFacade: createStorageFacadeMock(),
			localStatsStore: createLocalStatsStoreMock(),
		});
		const handler = handlers[MESSAGE_TYPES.GET_PROVIDER_SETTINGS];
		if (!handler) throw new Error("GET_PROVIDER_SETTINGS handler missing");

		const response = await handler(
			{ type: MESSAGE_TYPES.GET_PROVIDER_SETTINGS } as RuntimeRequest,
			{} as MessageSender,
		);

		expect(response).toEqual(DEFAULT_SETTINGS);
	});

	it("returns null for GET_PROVIDER_SETTINGS when no API key exists", async () => {
		const handlers = createBackgroundMessageHandlers({
			storageFacade: createStorageFacadeMock({
				hasApiKey: async () => false,
			}),
			localStatsStore: createLocalStatsStoreMock(),
		});
		const handler = handlers[MESSAGE_TYPES.GET_PROVIDER_SETTINGS];
		if (!handler) throw new Error("GET_PROVIDER_SETTINGS handler missing");

		const response = await handler(
			{ type: MESSAGE_TYPES.GET_PROVIDER_SETTINGS } as RuntimeRequest,
			{} as MessageSender,
		);

		expect(response).toBeNull();
	});

	it("builds runtime diagnostics snapshot from active tab state", async () => {
		const handlers = createBackgroundMessageHandlers({
			diagnosticsEngine: {
				collectRuntimeDiagnostics: async () => ({
					status: "ok",
					snapshot: {
						devModeEnabled: true,
						enabled: true,
						hasApiKey: true,
						activeTabId: 55,
						activeTabUrl: "https://www.linkedin.com/feed/",
						activeTabHost: "www.linkedin.com",
						supportedPlatformId: "linkedin",
						llmEndpointReachable: true,
						llmEndpointLatencyMs: 10,
						llmEndpointHttpStatus: 200,
						llmEndpointError: null,
					},
				}),
			} as unknown as DiagnosticsEngine,
			localStatsStore: createLocalStatsStoreMock(),
		});
		const handler = handlers[MESSAGE_TYPES.GET_RUNTIME_DIAGNOSTICS];
		if (!handler) throw new Error("diagnostics handler missing");

		const response = (await handler(
			{ type: MESSAGE_TYPES.GET_RUNTIME_DIAGNOSTICS } as RuntimeRequest,
			{} as MessageSender,
		)) as { status: string; snapshot: { activeTabId: number | null; hasApiKey: boolean } };

		expect(response.status).toBe("ok");
		expect(response.snapshot.activeTabId).toBe(55);
		expect(response.snapshot.hasApiKey).toBe(true);
	});

	it("returns local aggregate stats for GET_LOCAL_STATS", async () => {
		const handlers = createBackgroundMessageHandlers({
			localStatsStore: createLocalStatsStoreMock({
				getLocalStats: async () => ({
					today: { keep: 2, hide: 1, total: 3 },
					last30Days: { keep: 20, hide: 10, total: 30 },
					allTime: { keep: 200, hide: 50, total: 250 },
					dailyBreakdown: [{ date: "2026-02-28", keep: 2, hide: 1, total: 3 }],
				}),
			}),
		});
		const handler = handlers[MESSAGE_TYPES.GET_LOCAL_STATS];
		if (!handler) throw new Error("GET_LOCAL_STATS handler missing");

		const response = await handler(
			{ type: MESSAGE_TYPES.GET_LOCAL_STATS } as RuntimeRequest,
			{} as MessageSender,
		);

		expect(response).toEqual({
			today: { keep: 2, hide: 1, total: 3 },
			last30Days: { keep: 20, hide: 10, total: 30 },
			allTime: { keep: 200, hide: 50, total: 250 },
			dailyBreakdown: [{ date: "2026-02-28", keep: 2, hide: 1, total: 3 }],
		});
	});

	it("returns invalid_base_url when provider URL validation fails", async () => {
		const handlers = createBackgroundMessageHandlers({
			storageFacade: createStorageFacadeMock(),
			localStatsStore: createLocalStatsStoreMock(),
			ensureProviderPermissionFn: async () =>
				({
					status: "invalid_base_url",
					reason: "Base URL is not a valid URL.",
				}) satisfies ProviderPermissionResult,
		});
		const handler = handlers[MESSAGE_TYPES.SET_PROVIDER_SETTINGS];
		if (!handler) throw new Error("SET_PROVIDER_SETTINGS handler missing");

		const response = await handler(
			{
				type: MESSAGE_TYPES.SET_PROVIDER_SETTINGS,
				settings: DEFAULT_SETTINGS,
			} as RuntimeRequest,
			{} as MessageSender,
		);

		expect(response).toEqual({
			status: "invalid_base_url",
			reason: "Base URL is not a valid URL.",
		});
	});

	it("returns permission_denied and does not persist settings when host permission is denied", async () => {
		const writes: ProviderSettings[] = [];
		const handlers = createBackgroundMessageHandlers({
			storageFacade: createStorageFacadeMock({
				setProviderSettings: async (settings) => {
					writes.push(settings);
				},
			}),
			localStatsStore: createLocalStatsStoreMock(),
			ensureProviderPermissionFn: async () =>
				({
					status: "permission_denied",
					origin: "https://example.com",
				}) satisfies ProviderPermissionResult,
		});
		const handler = handlers[MESSAGE_TYPES.SET_PROVIDER_SETTINGS];
		if (!handler) throw new Error("SET_PROVIDER_SETTINGS handler missing");

		const response = await handler(
			{
				type: MESSAGE_TYPES.SET_PROVIDER_SETTINGS,
				settings: DEFAULT_SETTINGS,
			} as RuntimeRequest,
			{} as MessageSender,
		);

		expect(response).toEqual({
			status: "permission_denied",
			origin: "https://example.com",
		});
		expect(writes).toHaveLength(0);
	});

	it("normalizes and persists provider settings when permission is granted", async () => {
		const writes: ProviderSettings[] = [];
		const handlers = createBackgroundMessageHandlers({
			storageFacade: createStorageFacadeMock({
				setProviderSettings: async (settings) => {
					writes.push(settings);
				},
			}),
			localStatsStore: createLocalStatsStoreMock(),
			ensureProviderPermissionFn: async () =>
				({
					status: "ok",
					normalizedBaseUrl: "https://openrouter.ai/api",
					origin: "https://openrouter.ai",
					originPattern: "https://openrouter.ai/*",
				}) satisfies ProviderPermissionResult,
		});
		const handler = handlers[MESSAGE_TYPES.SET_PROVIDER_SETTINGS];
		if (!handler) throw new Error("SET_PROVIDER_SETTINGS handler missing");

		const response = await handler(
			{
				type: MESSAGE_TYPES.SET_PROVIDER_SETTINGS,
				settings: {
					apiKey: "sk-new",
					baseUrl: "https://openrouter.ai/api/",
					model: "openrouter/model",
				},
			} as RuntimeRequest,
			{} as MessageSender,
		);

		expect(response).toEqual({ status: "ok" });
		expect(writes).toEqual([
			{
				apiKey: "sk-new",
				baseUrl: "https://openrouter.ai/api",
				model: "openrouter/model",
			},
		]);
	});
});
