import { describe, expect, it } from "bun:test";
import type { ClassifyBatchMessage } from "../lib/messages";
import { MESSAGE_TYPES } from "../lib/messages";
import { ClassificationService } from "./classificationService";

function createRequest(postIds: string[]): ClassifyBatchMessage {
	return {
		type: MESSAGE_TYPES.CLASSIFY_BATCH,
		posts: postIds.map((postId) => ({
			post_id: postId,
			text: postId,
			attachments: [],
		})),
	};
}

describe("ClassificationService", () => {
	it("streams classify results to the content tab", async () => {
		const sentMessages: Array<{ tabId: number; message: unknown }> = [];
		const service = new ClassificationService({
			streamClassifyBatchFn: async (request, _jwt, onItem) => {
				for (const post of request.posts) {
					onItem({
						post_id: post.post_id,
						decision: "hide",
						source: "llm",
					});
				}
			},
			sendTabMessageFn: async (tabId, message) => {
				sentMessages.push({ tabId, message });
			},
		});

		service.classifyForTab(createRequest(["a", "b"]), "jwt", 42);
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(sentMessages).toEqual([
			{
				tabId: 42,
				message: {
					type: MESSAGE_TYPES.CLASSIFY_BATCH_RESULT,
					item: { post_id: "a", decision: "hide", source: "llm" },
				},
			},
			{
				tabId: 42,
				message: {
					type: MESSAGE_TYPES.CLASSIFY_BATCH_RESULT,
					item: { post_id: "b", decision: "hide", source: "llm" },
				},
			},
		]);
	});

	it("sends fail-open items when classify pipeline throws", async () => {
		const sentMessages: Array<{ tabId: number; message: unknown }> = [];
		const service = new ClassificationService({
			streamClassifyBatchFn: async () => {
				throw new Error("pipeline failed");
			},
			sendTabMessageFn: async (tabId, message) => {
				sentMessages.push({ tabId, message });
			},
		});

		service.classifyForTab(createRequest(["a", "b"]), "jwt", 8);
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(sentMessages).toEqual([
			{
				tabId: 8,
				message: {
					type: MESSAGE_TYPES.CLASSIFY_BATCH_RESULT,
					item: { post_id: "a" },
				},
			},
			{
				tabId: 8,
				message: {
					type: MESSAGE_TYPES.CLASSIFY_BATCH_RESULT,
					item: { post_id: "b" },
				},
			},
		]);
	});
});
