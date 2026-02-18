import { describe, expect, it } from "bun:test";
import { MESSAGE_TYPES, type RuntimeRequest } from "../lib/messages";
import type { PostData } from "../types";
import { createBackgroundMessageHandlers } from "./handlers";
import type { DiagnosticsEngine } from "./diagnosticsEngine";
import type { StorageFacade } from "./storageFacade";

type MessageSender = chrome.runtime.MessageSender;

function createPost(postId: string): PostData {
	return {
		post_id: postId,
		text: postId,
		attachments: [],
	};
}

function createStorageFacadeMock(
	overrides: Partial<StorageFacade> = {},
): StorageFacade {
	return {
		getJwt: async () => "jwt-token",
		getAuthState: async () => ({ jwt: "jwt-token", enabled: true }),
		getDevMode: async () => true,
		setJwt: async () => {},
		clearJwt: async () => {},
		toggleEnabled: async () => false,
		toggleDevMode: async () => false,
		...overrides,
	};
}

describe("background handlers", () => {
	it("returns disabled classify response when auth state is unavailable", async () => {
		const handlers = createBackgroundMessageHandlers({
			storageFacade: createStorageFacadeMock({
				getAuthState: async () => ({ jwt: null, enabled: true }),
			}),
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

	it("streams classify items back to sender tab", async () => {
		const tabMessages: Array<{ tabId: number; message: unknown }> = [];
		const handlers = createBackgroundMessageHandlers({
			storageFacade: createStorageFacadeMock(),
			streamClassifyBatchFn: async (request, _jwt, onItem) => {
				for (const post of request.posts) {
					onItem({ post_id: post.post_id, decision: "hide", source: "llm" });
				}
			},
			sendTabMessageFn: async (tabId, message) => {
				tabMessages.push({ tabId, message });
			},
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
		expect(tabMessages).toHaveLength(2);
		expect(tabMessages[0]).toEqual({
			tabId: 9,
			message: {
				type: MESSAGE_TYPES.CLASSIFY_BATCH_RESULT,
				item: {
					post_id: "post-1",
					decision: "hide",
					source: "llm",
				},
			},
		});
	});

	it("builds runtime diagnostics snapshot from active tab state", async () => {
		const handlers = createBackgroundMessageHandlers({
			diagnosticsEngine: {
				collectRuntimeDiagnostics: async () => ({
					status: "ok",
					snapshot: {
						devModeEnabled: true,
						enabled: true,
						hasJwt: true,
						activeTabId: 55,
						activeTabUrl: "https://www.linkedin.com/feed/",
						activeTabHost: "www.linkedin.com",
						supportedPlatformId: "linkedin",
						backendReachable: true,
						backendLatencyMs: 10,
						backendHttpStatus: 200,
						backendError: null,
					},
				}),
			} as unknown as DiagnosticsEngine,
		});
		const handler = handlers[MESSAGE_TYPES.GET_RUNTIME_DIAGNOSTICS];
		if (!handler) throw new Error("diagnostics handler missing");

		const response = (await handler(
			{ type: MESSAGE_TYPES.GET_RUNTIME_DIAGNOSTICS } as RuntimeRequest,
			{} as MessageSender,
		)) as {
			status: string;
			snapshot: {
				activeTabId: number | null;
				supportedPlatformId: string | null;
				hasJwt: boolean;
			};
		};

		expect(response.status).toBe("ok");
		expect(response.snapshot.activeTabId).toBe(55);
		expect(response.snapshot.supportedPlatformId).toBe("linkedin");
		expect(response.snapshot.hasJwt).toBe(true);
	});

	it("returns disabled diagnostics when developer mode is turned off", async () => {
		const handlers = createBackgroundMessageHandlers({
			diagnosticsEngine: {
				collectRuntimeDiagnostics: async () => ({
					status: "disabled",
					reason: "Developer mode is disabled.",
				}),
			} as unknown as DiagnosticsEngine,
		});
		const handler = handlers[MESSAGE_TYPES.GET_RUNTIME_DIAGNOSTICS];
		if (!handler) throw new Error("diagnostics handler missing");

		const response = (await handler(
			{ type: MESSAGE_TYPES.GET_RUNTIME_DIAGNOSTICS } as RuntimeRequest,
			{} as MessageSender,
		)) as {
			status: string;
			reason?: string;
		};

		expect(response).toEqual({
			status: "disabled",
			reason: "Developer mode is disabled.",
		});
	});
});
