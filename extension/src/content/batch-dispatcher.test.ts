import { describe, expect, it } from "bun:test";
import { MESSAGE_TYPES } from "../lib/messages";
import type { PostData } from "../types";
import { BatchDispatcher } from "./batch-dispatcher";

function createPost(postId: string): PostData {
	return {
		post_id: postId,
		author_id: `author-${postId}`,
		author_name: `Author ${postId}`,
		nodes: [{ id: "root", parent_id: null, kind: "root", text: postId }],
		attachments: [],
	};
}

describe("BatchDispatcher", () => {
	it("keeps queue state isolated per dispatcher instance", async () => {
		const messagesA: Array<{ type: string; posts: PostData[] }> = [];
		const messagesB: Array<{ type: string; posts: PostData[] }> = [];

		const dispatcherA = new BatchDispatcher({
			sendMessage: async (message) => {
				messagesA.push(message);
				return { status: "ok" };
			},
		});
		const dispatcherB = new BatchDispatcher({
			sendMessage: async (message) => {
				messagesB.push(message);
				return { status: "ok" };
			},
		});

		const postA = createPost("a");
		const postB = createPost("b");

		const promiseA = dispatcherA.enqueue(postA);
		const promiseB = dispatcherB.enqueue(postB);

		await new Promise<void>((resolve) => setTimeout(resolve, 90));

		expect(messagesA).toEqual([
			{
				type: MESSAGE_TYPES.CLASSIFY_BATCH,
				posts: [postA],
			},
		]);
		expect(messagesB).toEqual([
			{
				type: MESSAGE_TYPES.CLASSIFY_BATCH,
				posts: [postB],
			},
		]);

		dispatcherA.handleResult({
			post_id: postA.post_id,
			decision: "hide",
			source: "llm",
		});
		dispatcherB.handleResult({
			post_id: postB.post_id,
			decision: "keep",
			source: "cache",
		});

		expect(await promiseA).toEqual({
			decision: "hide",
			source: "llm",
		});
		expect(await promiseB).toEqual({
			decision: "keep",
			source: "cache",
		});
	});

	it("fails open when background queue dispatch does not acknowledge", async () => {
		const dispatcher = new BatchDispatcher({
			sendMessage: async () => ({ status: "disabled" }),
		});

		const result = await dispatcher.enqueue(createPost("disabled"));
		expect(result).toEqual({ decision: "keep", source: "error" });
	});
});
