// extension/src/content/batch-queue.ts
import {
	BATCH_MAX_ITEMS,
	BATCH_WINDOW_MS,
} from "../lib/config";
import { MESSAGE_TYPES } from "../lib/messages";
import { BatchClassifyResult, Decision, PostData, Source } from "../types";

type PendingEntry = {
	promise: Promise<{ decision: Decision; source: Source }>;
	resolve: (value: { decision: Decision; source: Source }) => void;
};

const pending = new Map<string, PendingEntry>();
const queue: PostData[] = [];
let flushTimer: ReturnType<typeof globalThis.setTimeout> | null = null;
let flushing = false;

function scheduleFlush(): void {
	if (flushTimer !== null) return;
	flushTimer = globalThis.setTimeout(() => {
		flushTimer = null;
		flush().catch((err) => console.error("Batch flush failed:", err));
	}, BATCH_WINDOW_MS);
}

function failBatch(posts: PostData[]): void {
	for (const post of posts) {
		const entry = pending.get(post.post_id);
		if (!entry) continue;
		entry.resolve({ decision: "keep", source: "error" });
		pending.delete(post.post_id);
	}
}

async function flush(): Promise<void> {
	if (flushing) return;
	flushing = true;
	if (flushTimer !== null) {
		globalThis.clearTimeout(flushTimer);
		flushTimer = null;
	}

	try {
		while (queue.length > 0) {
			const batch = queue.splice(0, BATCH_MAX_ITEMS);
			const response = await chrome.runtime.sendMessage({
				type: MESSAGE_TYPES.CLASSIFY_BATCH,
				posts: batch,
			});

			if (!response || response.status !== "ok") {
				failBatch(batch);
			}
		}
	} finally {
		flushing = false;
	}
}

export function enqueueBatch(
	post: PostData,
): Promise<{ decision: Decision; source: Source }> {
	const existing = pending.get(post.post_id);
	if (existing) return existing.promise;

	let resolve!: (value: { decision: Decision; source: Source }) => void;
	const promise = new Promise<{ decision: Decision; source: Source }>(
		(resolver) => {
			resolve = resolver;
		},
	);

	pending.set(post.post_id, { promise, resolve });
	queue.push(post);

	if (queue.length >= BATCH_MAX_ITEMS) {
		flush().catch((err) => console.error("Batch flush failed:", err));
	} else {
		scheduleFlush();
	}

	return promise;
}

export function handleBatchResult(item: BatchClassifyResult): void {
	const entry = pending.get(item.post_id);
	if (!entry) return;

	if (item.error === "quota_exceeded" || !item.decision || !item.source) {
		entry.resolve({ decision: "keep", source: "error" });
		pending.delete(item.post_id);
		return;
	}

	entry.resolve({ decision: item.decision, source: item.source });
	pending.delete(item.post_id);
}

export function getPendingBatchCount(): number {
	return pending.size;
}

export const __testing = {
	pendingCount(): number {
		return getPendingBatchCount();
	},
	reset(): void {
		if (flushTimer !== null) {
			globalThis.clearTimeout(flushTimer);
			flushTimer = null;
		}
		for (const entry of pending.values()) {
			entry.resolve({ decision: "keep", source: "error" });
		}
		pending.clear();
		queue.length = 0;
		flushing = false;
	},
};
