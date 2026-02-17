import { streamClassifyBatch } from "./classify-pipeline";
import { MESSAGE_TYPES, type ClassifyBatchMessage } from "../lib/messages";
import type { BatchClassifyResult } from "../types";

type SendTabMessage = (tabId: number, message: unknown) => Promise<void>;

type ClassificationServiceDependencies = {
	streamClassifyBatchFn?: typeof streamClassifyBatch;
	sendTabMessageFn?: SendTabMessage;
};

export class ClassificationService {
	private readonly streamClassifyBatchFn: NonNullable<
		ClassificationServiceDependencies["streamClassifyBatchFn"]
	>;
	private readonly sendTabMessageFn: NonNullable<
		ClassificationServiceDependencies["sendTabMessageFn"]
	>;

	constructor(dependencies: ClassificationServiceDependencies = {}) {
		this.streamClassifyBatchFn =
			dependencies.streamClassifyBatchFn ?? streamClassifyBatch;
		this.sendTabMessageFn =
			dependencies.sendTabMessageFn ??
			(async (tabId, message) => {
				await chrome.tabs.sendMessage(tabId, message);
			});
	}

	classifyForTab(
		request: ClassifyBatchMessage,
		jwt: string,
		tabId: number,
	): void {
		void this.streamClassifyBatchFn(request, jwt, (item) => {
			void this.sendTabMessageFn(tabId, {
				type: MESSAGE_TYPES.CLASSIFY_BATCH_RESULT,
				item,
			});
		}).catch(() => {
			for (const post of request.posts) {
				const failOpenItem: BatchClassifyResult = {
					post_id: post.post_id,
				};
				void this.sendTabMessageFn(tabId, {
					type: MESSAGE_TYPES.CLASSIFY_BATCH_RESULT,
					item: failOpenItem,
				});
			}
		});
	}
}
