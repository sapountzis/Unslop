import pLimit from "p-limit";
import {
	BATCH_MAX_INFLIGHT_REQUESTS,
	BATCH_MAX_ITEMS,
	BATCH_RESULT_TIMEOUT_MS,
	BATCH_WINDOW_MS,
} from "../lib/config";
import { createWindowedBatcher } from "../lib/windowed-batcher";
import type {
	BatchClassifyRequest,
	BatchClassifyResult,
	PostData,
} from "../types";
import { classifyPostsBatch } from "./api";
import { resolvePostAttachmentPayload } from "./attachment-resolver";

const ATTACHMENT_BUDGET_RATIO = 0.3;

export const ATTACHMENT_RESOLVE_CONCURRENCY = 8;
export const ATTACHMENT_RESOLVE_BUDGET_MS = Math.floor(
	BATCH_RESULT_TIMEOUT_MS * ATTACHMENT_BUDGET_RATIO,
);

type TimerHandle = ReturnType<typeof globalThis.setTimeout>;

type StreamClassifyBatchDependencies = {
	resolvePost?: (post: PostData) => Promise<PostData>;
	classifyBatch?: (
		request: BatchClassifyRequest,
		jwt: string,
		onItem: (item: BatchClassifyResult) => void,
	) => Promise<void>;
	now?: () => number;
	setTimer?: (handler: () => void, timeoutMs: number) => TimerHandle;
	clearTimer?: (timer: TimerHandle) => void;
	attachmentConcurrency?: number;
	attachmentBudgetMs?: number;
	dispatchBatchSize?: number;
	dispatchWindowMs?: number;
	dispatchConcurrency?: number;
};

type ResolvedPost = {
	postId: string;
	post: PostData;
};

function toFailOpenPost(post: PostData): PostData {
	return {
		...post,
		attachments: [],
	};
}

function waitForReadyOrTimeout(
	waitForReady: Promise<void>,
	timeoutMs: number,
	setTimer: (handler: () => void, timeoutMs: number) => TimerHandle,
	clearTimer: (timer: TimerHandle) => void,
): Promise<void> {
	if (timeoutMs <= 0) {
		return Promise.resolve();
	}

	return new Promise<void>((resolve) => {
		let settled = false;
		const timeout = setTimer(() => {
			if (settled) return;
			settled = true;
			resolve();
		}, timeoutMs);

		void waitForReady.then(() => {
			if (settled) return;
			settled = true;
			clearTimer(timeout);
			resolve();
		});
	});
}

export async function streamClassifyBatch(
	request: BatchClassifyRequest,
	jwt: string,
	onItem: (item: BatchClassifyResult) => void,
	dependencies: StreamClassifyBatchDependencies = {},
): Promise<void> {
	if (request.posts.length === 0) {
		return;
	}

	const resolvePost = dependencies.resolvePost ?? resolvePostAttachmentPayload;
	const classifyBatch = dependencies.classifyBatch ?? classifyPostsBatch;
	const now = dependencies.now ?? Date.now;
	const setTimer = dependencies.setTimer ?? globalThis.setTimeout;
	const clearTimer = dependencies.clearTimer ?? globalThis.clearTimeout;
	const attachmentConcurrency = Math.max(
		1,
		Math.floor(
			dependencies.attachmentConcurrency ?? ATTACHMENT_RESOLVE_CONCURRENCY,
		),
	);
	const attachmentBudgetMs = Math.max(
		0,
		Math.floor(dependencies.attachmentBudgetMs ?? ATTACHMENT_RESOLVE_BUDGET_MS),
	);
	const dispatchBatchSize = Math.max(
		1,
		Math.floor(dependencies.dispatchBatchSize ?? BATCH_MAX_ITEMS),
	);
	const dispatchWindowMs = Math.max(
		0,
		Math.floor(dependencies.dispatchWindowMs ?? BATCH_WINDOW_MS),
	);
	const dispatchConcurrency = Math.max(
		1,
		Math.floor(
			dependencies.dispatchConcurrency ?? BATCH_MAX_INFLIGHT_REQUESTS,
		),
	);
	const attachmentDeadline = now() + attachmentBudgetMs;

	const pendingPosts = new Map<string, PostData>(
		request.posts.map((post) => [post.post_id, post]),
	);
	const resolvedPosts: ResolvedPost[] = [];
	const classifyTasks: Promise<void>[] = [];
	const limit = pLimit(attachmentConcurrency);
	const dispatchLimit = pLimit(dispatchConcurrency);

	let waitingForResolved: (() => void) | null = null;
	let acceptingResolved = true;

	function pushResolved(item: ResolvedPost): void {
		if (!acceptingResolved) {
			return;
		}
		resolvedPosts.push(item);
		if (waitingForResolved) {
			const resolve = waitingForResolved;
			waitingForResolved = null;
			resolve();
		}
	}

	function waitForResolved(): Promise<void> {
		if (resolvedPosts.length > 0) {
			return Promise.resolve();
		}
		return new Promise<void>((resolve) => {
			waitingForResolved = resolve;
		});
	}

	async function dispatchBatch(posts: PostData[]): Promise<void> {
		try {
			await classifyBatch({ posts }, jwt, onItem);
		} catch {
			for (const post of posts) {
				onItem({ post_id: post.post_id });
			}
		}
	}

	const batcher = createWindowedBatcher<PostData>({
		maxItems: dispatchBatchSize,
		maxWaitMs: dispatchWindowMs,
		setTimer,
		clearTimer,
		onFlush: (posts) => {
			classifyTasks.push(dispatchLimit(() => dispatchBatch(posts)));
		},
	});

	for (const post of request.posts) {
		void limit(() => resolvePost(post))
			.then((resolvedPost) => {
				pushResolved({ postId: post.post_id, post: resolvedPost });
			})
			.catch(() => {
				pushResolved({ postId: post.post_id, post: toFailOpenPost(post) });
			});
	}

	while (pendingPosts.size > 0) {
		if (resolvedPosts.length === 0) {
			const remainingBudgetMs = attachmentDeadline - now();
			if (remainingBudgetMs <= 0) {
				break;
			}
			await waitForReadyOrTimeout(
				waitForResolved(),
				remainingBudgetMs,
				setTimer,
				clearTimer,
			);
		}

		while (resolvedPosts.length > 0) {
			const entry = resolvedPosts.shift();
			if (!entry) continue;
			if (!pendingPosts.has(entry.postId)) {
				continue;
			}
			pendingPosts.delete(entry.postId);
			batcher.push(entry.post);
		}
	}

	if (pendingPosts.size > 0) {
		limit.clearQueue();
		for (const post of pendingPosts.values()) {
			batcher.push(toFailOpenPost(post));
		}
		pendingPosts.clear();
	}

	acceptingResolved = false;
	batcher.close();
	await Promise.all(classifyTasks);
}
