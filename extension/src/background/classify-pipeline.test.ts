import { describe, expect, it } from "bun:test";
import type {
	BatchClassifyRequest,
	BatchClassifyResult,
	PostData,
} from "../types";
import { streamClassifyBatch } from "./classify-pipeline";

function createPost(postId: string): PostData {
	return {
		post_id: postId,
		author_id: `author-${postId}`,
		author_name: `Author ${postId}`,
		nodes: [{ id: "root", parent_id: null, kind: "root", text: postId }],
		attachments: [
			{
				node_id: "root",
				kind: "image",
				src: `https://example.com/${postId}.jpg`,
				alt: "",
				ordinal: 0,
			},
		],
	};
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("streamClassifyBatch", () => {
	it("dispatches ready posts without waiting for slow attachment resolution", async () => {
		const fast = createPost("fast");
		const slow = createPost("slow");
		let resolveSlow!: (post: PostData) => void;

		const classifyCalls: string[][] = [];
		const resultItems: BatchClassifyResult[] = [];

		const run = streamClassifyBatch(
			{ posts: [fast, slow] },
			"jwt",
			(item) => resultItems.push(item),
			{
				resolvePost: async (post) => {
					if (post.post_id === "slow") {
						return await new Promise<PostData>((resolve) => {
							resolveSlow = resolve;
						});
					}
					return { ...post, attachments: [] };
				},
				classifyBatch: async (request, _jwt, onItem) => {
					classifyCalls.push(request.posts.map((post) => post.post_id));
					for (const post of request.posts) {
						onItem({
							post_id: post.post_id,
							decision: "keep",
							source: "llm",
						});
					}
				},
				dispatchBatchSize: 1,
				dispatchWindowMs: 0,
				attachmentBudgetMs: 500,
			},
		);

		await sleep(10);
		expect(classifyCalls).toEqual([["fast"]]);

		resolveSlow({ ...slow, attachments: [] });
		await run;

		expect(classifyCalls).toEqual([["fast"], ["slow"]]);
		expect(resultItems).toHaveLength(2);
	});

	it("uses attachment budget deadline and classifies unresolved posts fail-open", async () => {
		const postA = createPost("a");
		const postB = createPost("b");
		const postC = createPost("c");

		const classifyRequests: BatchClassifyRequest[] = [];

		await streamClassifyBatch(
			{ posts: [postA, postB, postC] },
			"jwt",
			() => {},
			{
				resolvePost: async (post) => {
					if (post.post_id === "b") {
						await sleep(80);
					}
					return {
						...post,
						attachments: [
							{ ...post.attachments[0], kind: "pdf", excerpt_text: "ok" },
						],
					};
				},
				classifyBatch: async (request) => {
					classifyRequests.push(request);
				},
				attachmentBudgetMs: 25,
				dispatchBatchSize: 2,
				dispatchWindowMs: 0,
			},
		);

		expect(classifyRequests).toHaveLength(2);
		const allPosts = classifyRequests.flatMap((request) => request.posts);
		expect(allPosts.map((post) => post.post_id).sort()).toEqual([
			"a",
			"b",
			"c",
		]);

		const fallbackB = allPosts.find((post) => post.post_id === "b");
		expect(fallbackB?.attachments).toEqual([]);
	});

	it("respects configured attachment concurrency", async () => {
		const posts = Array.from({ length: 9 }, (_, index) =>
			createPost(`post-${index}`),
		);
		let active = 0;
		let maxActive = 0;

		await streamClassifyBatch({ posts }, "jwt", () => {}, {
			resolvePost: async (post) => {
				active += 1;
				maxActive = Math.max(maxActive, active);
				await sleep(20);
				active -= 1;
				return { ...post, attachments: [] };
			},
			classifyBatch: async () => {},
			attachmentConcurrency: 3,
			attachmentBudgetMs: 500,
			dispatchBatchSize: 20,
			dispatchWindowMs: 0,
		});

		expect(maxActive).toBe(3);
	});

	it("fails open for every post in a classify micro-batch when request fails", async () => {
		const postA = createPost("a");
		const postB = createPost("b");
		const results: BatchClassifyResult[] = [];

		await streamClassifyBatch(
			{ posts: [postA, postB] },
			"jwt",
			(item) => results.push(item),
			{
				resolvePost: async (post) => ({ ...post, attachments: [] }),
				classifyBatch: async () => {
					throw new Error("backend_unavailable");
				},
				dispatchBatchSize: 20,
				dispatchWindowMs: 0,
				attachmentBudgetMs: 500,
			},
		);

		expect(results).toEqual([{ post_id: "a" }, { post_id: "b" }]);
	});

	it("limits classify request concurrency", async () => {
		const posts = [createPost("a"), createPost("b"), createPost("c")];
		let active = 0;
		let maxActive = 0;

		await streamClassifyBatch({ posts }, "jwt", () => {}, {
			resolvePost: async (post) => ({ ...post, attachments: [] }),
			classifyBatch: async () => {
				active += 1;
				maxActive = Math.max(maxActive, active);
				await sleep(20);
				active -= 1;
			},
			dispatchBatchSize: 1,
			dispatchWindowMs: 0,
			dispatchConcurrency: 1,
			attachmentBudgetMs: 500,
		});

		expect(maxActive).toBe(1);
	});
});
