// extension/src/background/localClassifier.ts
// Replaces classificationService + classifyPipeline.
// Runs classification entirely in the service worker using the user's LLM API key.

import pLimit from "p-limit";
import {
	ATTACHMENT_BUDGET_RATIO,
	BATCH_MAX_INFLIGHT_REQUESTS,
	BATCH_RESULT_TIMEOUT_MS,
} from "../lib/config";
import { classifyPostWithLlm } from "./llmClient";
import { resolvePostAttachmentPayload } from "./attachmentResolver";
import { MESSAGE_TYPES } from "../lib/messages";
import type { ProviderSettings } from "./llmClient";
import type { BatchClassifyResult, PostData } from "../types";

export const ATTACHMENT_RESOLVE_BUDGET_MS = Math.floor(
    BATCH_RESULT_TIMEOUT_MS * ATTACHMENT_BUDGET_RATIO,
);

// ── Attachment resolution with timeout ───────────────────

async function resolveWithTimeout(post: PostData, budgetMs: number): Promise<PostData> {
    if (budgetMs <= 0) {
        return { ...post, attachments: [] };
    }

    return new Promise((resolve) => {
        let settled = false;

        const timeoutId = setTimeout(() => {
            if (settled) return;
            settled = true;
            resolve({ ...post, attachments: [] });
        }, budgetMs);

        void resolvePostAttachmentPayload(post)
            .then((resolved) => {
                if (settled) return;
                settled = true;
                clearTimeout(timeoutId);
                resolve(resolved);
            })
            .catch(() => {
                if (settled) return;
                settled = true;
                clearTimeout(timeoutId);
                resolve({ ...post, attachments: [] });
            });
    });
}

// ── Classification of a single post ──────────────────────

export async function classifySinglePost(
	settings: ProviderSettings,
	post: PostData,
): Promise<BatchClassifyResult> {
	try {
		const resolvedPost = await resolveWithTimeout(post, ATTACHMENT_RESOLVE_BUDGET_MS);
		const llmResult = await classifyPostWithLlm(settings, resolvedPost);

		if (llmResult.source === "llm" && llmResult.decision) {
			return {
				post_id: post.post_id,
				decision: llmResult.decision,
				source: "llm",
			};
		}

		// Fail-open decision for provider/runtime errors.
		return {
			post_id: post.post_id,
			decision: "keep",
			source: "error",
		};
	} catch {
		// Fail-open
		return { post_id: post.post_id };
	}
}

// ── Batch processing ─────────────────────────────────────

type ClassifySingleFn = typeof classifySinglePost;

/**
 * Process a batch of posts and stream results via onItem callback.
 * Concurrency-limited. Fail-open: all errors produce keep decisions.
 */
export async function streamLocalClassifyBatch(
    posts: PostData[],
    settings: ProviderSettings,
    onItem: (item: BatchClassifyResult) => void,
    deps: { classifySingleFn?: ClassifySingleFn } = {},
): Promise<void> {
    if (posts.length === 0) return;

    const classifyFn = deps.classifySingleFn ?? classifySinglePost;
    const limit = pLimit(BATCH_MAX_INFLIGHT_REQUESTS);

    await Promise.all(
        posts.map((post) =>
            limit(async () => {
                const result = await classifyFn(settings, post);
                onItem(result);
            }),
        ),
    );
}

// ── Service: mirrors ClassificationService interface ──────

type SendTabMessage = (tabId: number, message: unknown) => Promise<void>;
type OnClassifyResult = (item: BatchClassifyResult) => void | Promise<void>;

export class LocalClassificationService {
    private readonly streamFn: typeof streamLocalClassifyBatch;
    private readonly sendTabMessageFn: SendTabMessage;

    constructor(
        deps: {
            streamFn?: typeof streamLocalClassifyBatch;
            sendTabMessageFn?: SendTabMessage;
        } = {},
    ) {
        this.streamFn = deps.streamFn ?? streamLocalClassifyBatch;
        this.sendTabMessageFn =
            deps.sendTabMessageFn ??
            (async (tabId, message) => {
                await chrome.tabs.sendMessage(tabId, message);
            });
    }

    classifyBatch(
        posts: PostData[],
        settings: ProviderSettings,
        tabId: number,
        onResult?: OnClassifyResult,
    ): void {
        void this.streamFn(posts, settings, (item) => {
            if (onResult) {
                void onResult(item);
            }
            void this.sendTabMessageFn(tabId, {
                type: MESSAGE_TYPES.CLASSIFY_BATCH_RESULT,
                item,
            });
        }).catch(() => {
            // Fail-open: emit keep for all posts
            for (const post of posts) {
                const failOpen: BatchClassifyResult = { post_id: post.post_id };
                if (onResult) {
                    void onResult(failOpen);
                }
                void this.sendTabMessageFn(tabId, {
                    type: MESSAGE_TYPES.CLASSIFY_BATCH_RESULT,
                    item: failOpen,
                });
            }
        });
    }
}
