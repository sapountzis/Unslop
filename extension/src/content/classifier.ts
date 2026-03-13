// Classifier — batches posts to the background service worker and awaits decisions.
//
// Posts are queued and flushed after BATCH_WINDOW_MS (or immediately when
// BATCH_MAX_ITEMS is reached). Results are delivered via onBatchResult().
import {
	BATCH_MAX_ITEMS,
	BATCH_RESULT_TIMEOUT_MS,
	BATCH_WINDOW_MS,
	FETCH_TIMEOUT_MS,
} from "../lib/config";
import { buildClassificationCacheKey } from "../lib/hash";
import { MESSAGE_TYPES } from "../lib/messages";
import { decisionCache } from "../lib/storage";
import type { BatchClassifyResult, Decision, PostData, Source } from "../types";
export type ClassifyResult = { decision: Decision; source: Source };
const FAIL_OPEN: ClassifyResult = { decision: "keep", source: "error" };
const PENDING_EXPIRY_MS = FETCH_TIMEOUT_MS + BATCH_RESULT_TIMEOUT_MS;
type PendingEntry = {
	cacheKey: string;
	resolve: (r: ClassifyResult) => void;
	timer: ReturnType<typeof setTimeout>;
};
type BuildCacheKeyFn = (post: PostData) => Promise<string>;
export class Classifier {
	private readonly pending = new Map<string, PendingEntry>();
	private readonly queue: PostData[] = [];
	private flushTimer: ReturnType<typeof setTimeout> | null = null;
	private flushing = false;
	constructor(
		private readonly sendMessage: (msg: {
			type: string;
			posts: PostData[];
		}) => Promise<{ status: "ok" | "disabled" | "error" } | null | undefined>,
		private readonly buildCacheKeyFn: BuildCacheKeyFn = async (post) =>
			await buildClassificationCacheKey({
				text: post.text,
				attachments: post.attachments,
			}),
	) {}
	async classify(post: PostData): Promise<ClassifyResult> {
		const cacheKey = await this.buildCacheKeyFn(post);

		// Cache hit — skip the network entirely.
		const cached = await decisionCache.get(cacheKey);
		if (cached && cached.source !== "error") {
			return { decision: cached.decision, source: cached.source };
		}
		// Already in-flight — reuse the same promise.
		const existing = this.pending.get(post.post_id);
		if (existing) {
			return new Promise<ClassifyResult>((resolve) => {
				const original = existing.resolve;
				existing.resolve = (r) => {
					original(r);
					resolve(r);
				};
			});
		}
		return new Promise<ClassifyResult>((resolve) => {
			const timer = setTimeout(() => {
				this.pending.delete(post.post_id);
				resolve(FAIL_OPEN);
			}, PENDING_EXPIRY_MS);
			this.pending.set(post.post_id, { cacheKey, resolve, timer });
			this.queue.push(post);
			if (this.queue.length >= BATCH_MAX_ITEMS) {
				void this.flush();
			} else {
				this.scheduleFlush();
			}
		});
	}
	onBatchResult(result: BatchClassifyResult): void {
		const entry = this.pending.get(result.post_id);
		if (!entry) return;
		clearTimeout(entry.timer);
		this.pending.delete(result.post_id);
		const r: ClassifyResult =
			!result.decision || !result.source
				? FAIL_OPEN
				: { decision: result.decision, source: result.source };
		if (r.source !== "error") {
			void decisionCache.set(entry.cacheKey, r.decision, r.source);
		}
		entry.resolve(r);
	}
	reset(): void {
		if (this.flushTimer !== null) {
			clearTimeout(this.flushTimer);
			this.flushTimer = null;
		}
		for (const entry of this.pending.values()) {
			clearTimeout(entry.timer);
			entry.resolve(FAIL_OPEN);
		}
		this.pending.clear();
		this.queue.length = 0;
		this.flushing = false;
	}
	private scheduleFlush(): void {
		if (this.flushTimer !== null) return;
		this.flushTimer = setTimeout(() => {
			this.flushTimer = null;
			void this.flush();
		}, BATCH_WINDOW_MS);
	}
	private async flush(): Promise<void> {
		if (this.flushing) return;
		this.flushing = true;
		if (this.flushTimer !== null) {
			clearTimeout(this.flushTimer);
			this.flushTimer = null;
		}
		try {
			while (this.queue.length > 0) {
				const batch = this.queue.splice(0, BATCH_MAX_ITEMS);
				try {
					const response = await this.sendMessage({
						type: MESSAGE_TYPES.CLASSIFY_BATCH,
						posts: batch,
					});
					if (!response || response.status !== "ok") {
						this.failBatch(batch);
					}
				} catch {
					this.failBatch(batch);
				}
			}
		} finally {
			this.flushing = false;
		}
	}
	private failBatch(posts: PostData[]): void {
		for (const post of posts) {
			const entry = this.pending.get(post.post_id);
			if (!entry) continue;
			clearTimeout(entry.timer);
			this.pending.delete(post.post_id);
			entry.resolve(FAIL_OPEN);
		}
	}
}
