// extension/src/content/batch-queue.ts
import type { BatchClassifyResult, Decision, PostData, Source } from "../types";
import { BatchDispatcher } from "./batch-dispatcher";

const defaultBatchDispatcher = new BatchDispatcher();

export function enqueueBatch(
	post: PostData,
): Promise<{ decision: Decision; source: Source }> {
	return defaultBatchDispatcher.enqueue(post);
}

export function handleBatchResult(item: BatchClassifyResult): void {
	defaultBatchDispatcher.handleResult(item);
}

export function getPendingBatchCount(): number {
	return defaultBatchDispatcher.getPendingCount();
}

export const __testing = {
	pendingCount(): number {
		return defaultBatchDispatcher.getPendingCount();
	},
	reset(): void {
		defaultBatchDispatcher.reset();
	},
	setPendingEntryExpiryMs(expiryMs: number): void {
		defaultBatchDispatcher.setPendingEntryExpiryMs(expiryMs);
	},
};
