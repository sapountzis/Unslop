import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { enqueueBatch, __testing, handleBatchResult } from "./batch-queue";
import { PostData } from "../types";
import { MESSAGE_TYPES } from "../lib/messages";

const post: PostData = {
	post_id: "p1",
	author_id: "a1",
	author_name: "A",
	nodes: [{ id: "root", parent_id: null, kind: "root", text: "hello" }],
	attachments: [],
};

// Compile-time PostData contract checks for the multimodal payload fields.
type _PostDataNodes = PostData["nodes"];
type _PostDataAttachments = PostData["attachments"];

type TestChrome = {
	runtime: {
		sendMessage: (message: unknown) => Promise<{ status: "ok" }>;
	};
};
type TestGlobal = typeof globalThis & {
	chrome?: TestChrome;
};

const testGlobal = globalThis as TestGlobal;
const originalChrome = testGlobal.chrome;
let lastMessage: unknown = null;

describe("batch queue resilience", () => {
	beforeEach(() => {
		testGlobal.chrome = {
			runtime: {
				sendMessage: async (message: unknown) => {
					lastMessage = message;
					return { status: "ok" };
				},
			},
		};
		lastMessage = null;
	});

	afterEach(() => {
		__testing.reset();
		testGlobal.chrome = originalChrome;
	});

	it("keeps entries pending until a background result arrives", async () => {
		const resultPromise = enqueueBatch(post);
		await new Promise<void>((resolve) => globalThis.setTimeout(resolve, 5));
		expect(__testing.pendingCount()).toBe(1);

		handleBatchResult({
			post_id: post.post_id,
			decision: "hide",
			source: "llm",
		});

		const result = await resultPromise;
		expect(result).toEqual({ decision: "hide", source: "llm" });
		expect(__testing.pendingCount()).toBe(0);
	});

	it("fails open for invalid streamed results", async () => {
		const resultPromise = enqueueBatch(post);

		handleBatchResult({
			post_id: post.post_id,
		});

		const result = await resultPromise;
		expect(result).toEqual({ decision: "keep", source: "error" });
		expect(__testing.pendingCount()).toBe(0);
	});

	it("does not throw on unknown result IDs", () => {
		handleBatchResult({
			post_id: "unknown",
			decision: "hide",
			source: "llm",
		});

		expect(__testing.pendingCount()).toBe(0);
	});

	it("sends nodes and attachments in CLASSIFY_BATCH payload", async () => {
		const resultPromise = enqueueBatch(post);
		await new Promise<void>((resolve) => globalThis.setTimeout(resolve, 90));

		const payload = lastMessage as {
			type: string;
			posts: Array<Record<string, unknown>>;
		};
		expect(payload.type).toBe(MESSAGE_TYPES.CLASSIFY_BATCH);
		expect(payload.posts[0]?.nodes).toEqual([
			{ id: "root", parent_id: null, kind: "root", text: "hello" },
		]);
		expect(payload.posts[0]?.attachments).toEqual([]);

		handleBatchResult({
			post_id: post.post_id,
			decision: "keep",
			source: "llm",
		});
		await resultPromise;
	});

	it("expires pending entries and allows re-enqueue for the same post", async () => {
		__testing.setPendingEntryExpiryMs(10);
		const firstPromise = enqueueBatch(post);

		await new Promise<void>((resolve) => globalThis.setTimeout(resolve, 25));

		expect(await firstPromise).toEqual({ decision: "keep", source: "error" });
		expect(__testing.pendingCount()).toBe(0);

		__testing.setPendingEntryExpiryMs(500);
		const secondPromise = enqueueBatch(post);

		handleBatchResult({
			post_id: post.post_id,
			decision: "hide",
			source: "llm",
		});

		expect(await secondPromise).toEqual({ decision: "hide", source: "llm" });
		expect(__testing.pendingCount()).toBe(0);
	});
});
