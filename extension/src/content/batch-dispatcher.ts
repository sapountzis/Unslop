import {
	BATCH_MAX_ITEMS,
	BATCH_RESULT_TIMEOUT_MS,
	BATCH_WINDOW_MS,
	FETCH_TIMEOUT_MS,
} from "../lib/config";
import { MESSAGE_TYPES } from "../lib/messages";
import type { BatchClassifyResult, Decision, PostData, Source } from "../types";

type TimerId = ReturnType<typeof globalThis.setTimeout>;

type PendingEntry = {
	promise: Promise<{ decision: Decision; source: Source }>;
	resolve: (value: { decision: Decision; source: Source }) => void;
	expiryTimer: TimerId;
};

type ClassifyBatchResponse = {
	status: "ok" | "disabled" | "error";
};

type BatchDispatcherDependencies = {
	sendMessage?: (message: {
		type: typeof MESSAGE_TYPES.CLASSIFY_BATCH;
		posts: PostData[];
	}) => Promise<ClassifyBatchResponse | null | undefined>;
	setTimer?: typeof globalThis.setTimeout;
	clearTimer?: typeof globalThis.clearTimeout;
	batchWindowMs?: number;
	batchMaxItems?: number;
	pendingEntryExpiryMs?: number;
};

const DEFAULT_PENDING_ENTRY_EXPIRY_MS =
	FETCH_TIMEOUT_MS + BATCH_RESULT_TIMEOUT_MS;

function toFailOpenResult(): { decision: Decision; source: Source } {
	return { decision: "keep", source: "error" };
}

export class BatchDispatcher {
	private readonly pending = new Map<string, PendingEntry>();
	private readonly queue: PostData[] = [];
	private flushTimer: TimerId | null = null;
	private flushing = false;
	private pendingEntryExpiryMs: number;

	private readonly sendMessage: NonNullable<
		BatchDispatcherDependencies["sendMessage"]
	>;
	private readonly setTimer: NonNullable<
		BatchDispatcherDependencies["setTimer"]
	>;
	private readonly clearTimer: NonNullable<
		BatchDispatcherDependencies["clearTimer"]
	>;
	private readonly batchWindowMs: number;
	private readonly batchMaxItems: number;

	constructor(dependencies: BatchDispatcherDependencies = {}) {
		this.sendMessage =
			dependencies.sendMessage ??
			((message) =>
				chrome.runtime.sendMessage(message) as Promise<ClassifyBatchResponse>);
		this.setTimer = dependencies.setTimer ?? globalThis.setTimeout;
		this.clearTimer = dependencies.clearTimer ?? globalThis.clearTimeout;
		this.batchWindowMs = Math.max(
			0,
			Math.floor(dependencies.batchWindowMs ?? BATCH_WINDOW_MS),
		);
		this.batchMaxItems = Math.max(
			1,
			Math.floor(dependencies.batchMaxItems ?? BATCH_MAX_ITEMS),
		);
		this.pendingEntryExpiryMs = Math.max(
			0,
			Math.floor(
				dependencies.pendingEntryExpiryMs ?? DEFAULT_PENDING_ENTRY_EXPIRY_MS,
			),
		);
	}

	enqueue(post: PostData): Promise<{ decision: Decision; source: Source }> {
		const existing = this.pending.get(post.post_id);
		if (existing) return existing.promise;

		let resolve!: (value: { decision: Decision; source: Source }) => void;
		const promise = new Promise<{ decision: Decision; source: Source }>(
			(resolver) => {
				resolve = resolver;
			},
		);

		const expiryTimer = this.setTimer(() => {
			const entry = this.pending.get(post.post_id);
			if (!entry || entry.promise !== promise) return;

			this.clearPendingEntry(post.post_id);
			entry.resolve(toFailOpenResult());
		}, this.pendingEntryExpiryMs);

		this.pending.set(post.post_id, { promise, resolve, expiryTimer });
		this.queue.push(post);

		if (this.queue.length >= this.batchMaxItems) {
			void this.flush().catch((err) =>
				console.error("Batch flush failed:", err),
			);
		} else {
			this.scheduleFlush();
		}

		return promise;
	}

	handleResult(item: BatchClassifyResult): void {
		const entry = this.clearPendingEntry(item.post_id);
		if (!entry) return;

		if (item.error === "quota_exceeded" || !item.decision || !item.source) {
			entry.resolve(toFailOpenResult());
			return;
		}

		entry.resolve({ decision: item.decision, source: item.source });
	}

	getPendingCount(): number {
		return this.pending.size;
	}

	reset(): void {
		if (this.flushTimer !== null) {
			this.clearTimer(this.flushTimer);
			this.flushTimer = null;
		}
		for (const entry of this.pending.values()) {
			this.clearTimer(entry.expiryTimer);
			entry.resolve(toFailOpenResult());
		}
		this.pending.clear();
		this.queue.length = 0;
		this.flushing = false;
		this.pendingEntryExpiryMs = DEFAULT_PENDING_ENTRY_EXPIRY_MS;
	}

	setPendingEntryExpiryMs(expiryMs: number): void {
		this.pendingEntryExpiryMs = Math.max(0, Math.floor(expiryMs));
	}

	private clearPendingEntry(postId: string): PendingEntry | undefined {
		const entry = this.pending.get(postId);
		if (!entry) return undefined;
		this.clearTimer(entry.expiryTimer);
		this.pending.delete(postId);
		return entry;
	}

	private scheduleFlush(): void {
		if (this.flushTimer !== null) return;
		this.flushTimer = this.setTimer(() => {
			this.flushTimer = null;
			void this.flush().catch((err) =>
				console.error("Batch flush failed:", err),
			);
		}, this.batchWindowMs);
	}

	private failBatch(posts: PostData[]): void {
		for (const post of posts) {
			const entry = this.clearPendingEntry(post.post_id);
			if (!entry) continue;
			entry.resolve(toFailOpenResult());
		}
	}

	private async flush(): Promise<void> {
		if (this.flushing) return;
		this.flushing = true;
		if (this.flushTimer !== null) {
			this.clearTimer(this.flushTimer);
			this.flushTimer = null;
		}

		try {
			while (this.queue.length > 0) {
				const batch = this.queue.splice(0, this.batchMaxItems);
				const response = await this.sendMessage({
					type: MESSAGE_TYPES.CLASSIFY_BATCH,
					posts: batch,
				});

				if (!response || response.status !== "ok") {
					this.failBatch(batch);
				}
			}
		} finally {
			this.flushing = false;
		}
	}
}
