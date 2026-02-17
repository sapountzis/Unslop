import { describe, expect, it } from "bun:test";
import { MESSAGE_TYPES, type RuntimeRequest } from "../lib/messages";
import type { PostData } from "../types";
import { createBackgroundMessageHandlers } from "./handlers";
import type { StorageFacade } from "./storage-facade";

type MessageSender = chrome.runtime.MessageSender;

function createPost(postId: string): PostData {
	return {
		post_id: postId,
		author_id: `author-${postId}`,
		author_name: `Author ${postId}`,
		nodes: [{ id: "root", parent_id: null, kind: "root", text: postId }],
		attachments: [],
	};
}

function createStorageFacadeMock(
	overrides: Partial<StorageFacade> = {},
): StorageFacade {
	return {
		getJwt: async () => "jwt-token",
		getAuthState: async () => ({ jwt: "jwt-token", enabled: true }),
		setJwt: async () => {},
		clearJwt: async () => {},
		toggleEnabled: async () => false,
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
			storageFacade: createStorageFacadeMock({
				getAuthState: async () => ({ jwt: "jwt-token", enabled: true }),
			}),
			queryTabsFn: async () =>
				[
					{
						id: 55,
						url: "https://www.linkedin.com/feed/",
					},
				] as chrome.tabs.Tab[],
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
				activeTabIsLinkedIn: boolean;
				activeTabIsSupportedFeedHost: boolean;
				hasJwt: boolean;
			};
		};

		expect(response.status).toBe("ok");
		expect(response.snapshot.activeTabId).toBe(55);
		expect(response.snapshot.activeTabIsLinkedIn).toBe(true);
		expect(response.snapshot.activeTabIsSupportedFeedHost).toBe(true);
		expect(response.snapshot.hasJwt).toBe(true);
	});

	it("ignores reload requests for non-feed hosts", async () => {
		let reloadedTabId: number | null = null;
		const handlers = createBackgroundMessageHandlers({
			storageFacade: createStorageFacadeMock(),
			getTabFn: async () =>
				({
					id: 12,
					url: "https://example.com/path",
				}) as chrome.tabs.Tab,
			reloadTabFn: async (tabId) => {
				reloadedTabId = tabId;
			},
		});
		const handler = handlers[MESSAGE_TYPES.RELOAD_ACTIVE_TAB];
		if (!handler) throw new Error("reload handler missing");

		const response = await handler(
			{
				type: MESSAGE_TYPES.RELOAD_ACTIVE_TAB,
				tabId: 12,
			} as RuntimeRequest,
			{} as MessageSender,
		);

		expect(response).toEqual({ status: "ignored" });
		expect(reloadedTabId).toBeNull();
	});
});
