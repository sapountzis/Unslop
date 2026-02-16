import {
	canonicalizeContentFingerprintInput,
	computeContentFingerprint,
	type ContentFingerprintInput,
} from "../lib/content-fingerprint";
import type { Decision } from "../types/classification";
import type { LlmService, PostInput as LlmPostInput } from "./llm";
import type { QuotaService } from "./quota";
import type { ClassificationCacheRepository } from "../repositories/classification-cache-repository";
import type { ClassificationEventRepository } from "../repositories/classification-event-repository";
import type {
	ActivityInsert,
	ActivityRepository,
} from "../repositories/activity-repository";
import type { MultimodalClassifyPost } from "../types/multimodal";
import type { ScoringEngine as ScoringEngineType } from "./scoring";
import type { AppLogger } from "../lib/logger-types";

const CACHE_LOOKBACK_DAYS = 30;

type LlmResult = Awaited<ReturnType<LlmService["classifyPost"]>>;

type JsonObject = Record<string, unknown>;

type NormalizedPost = ClassifyInputPost & {
	fingerprint: string;
	canonicalContent: JsonObject;
};

export type ClassifyInputPost = MultimodalClassifyPost;

export interface ClassificationResponse {
	post_id: string;
	decision: Decision;
	source: "llm" | "cache" | "error";
}

export type BatchClassificationResponse =
	| ClassificationResponse
	| {
			post_id: string;
			error: "quota_exceeded";
	  };

export interface ClassificationService {
	classifySingle: (
		userId: string,
		post: ClassifyInputPost,
	) => Promise<ClassificationResponse>;
	classifyBatchStream: (
		userId: string,
		posts: ClassifyInputPost[],
		onOutcome: (outcome: BatchClassificationResponse) => Promise<void> | void,
	) => Promise<void>;
	hasAvailableQuota: (userId: string) => Promise<boolean>;
}

export interface ClassificationServiceDeps {
	llmService: LlmService;
	quotaService: QuotaService;
	classificationCacheRepository: ClassificationCacheRepository;
	classificationEventRepository: ClassificationEventRepository;
	activityRepository: ActivityRepository;
	logger: Pick<AppLogger, "info">;
	batchLlmConcurrency: number;
}

export class QuotaExceededError extends Error {
	constructor() {
		super("quota_exceeded");
		this.name = "QuotaExceededError";
	}
}

function resolveProviderErrorMessage(llmResult: LlmResult): string | undefined {
	if (
		llmResult.provider_error_message &&
		llmResult.provider_error_message.length > 0
	) {
		return llmResult.provider_error_message;
	}

	if (llmResult.source === "error") {
		return `llm_error:${llmResult.model}`;
	}

	return undefined;
}

function normalizePost(post: ClassifyInputPost): NormalizedPost {
	const fingerprintInput: ContentFingerprintInput = {
		post_id: post.post_id,
		author_id: post.author_id,
		author_name: post.author_name,
		nodes: post.nodes.map((node) => ({ ...node })),
		attachments: post.attachments.map((attachment) => ({ ...attachment })),
	};
	const canonicalContent =
		canonicalizeContentFingerprintInput(fingerprintInput);

	return {
		...post,
		fingerprint: computeContentFingerprint(fingerprintInput),
		canonicalContent,
	};
}

export function createClassificationService(
	deps: ClassificationServiceDeps,
): ClassificationService {
	let scoringEnginePromise: Promise<ScoringEngineType> | null = null;

	function getScoringEngine(): Promise<ScoringEngineType> {
		if (!scoringEnginePromise) {
			scoringEnginePromise = import("./scoring").then(
				(module) => new module.ScoringEngine(),
			);
		}

		return scoringEnginePromise;
	}

	function logCacheDecision(postId: string, decision: Decision): void {
		deps.logger.info("slop_audit", {
			event: "audit_decision",
			source: "cache",
			post_id: postId,
			decision,
			rule: "CACHE_HIT",
			reason: "cache_hit",
		});
	}

	function getCacheExpiry(): Date {
		const cacheExpiry = new Date();
		cacheExpiry.setDate(cacheExpiry.getDate() - CACHE_LOOKBACK_DAYS);
		return cacheExpiry;
	}

	function toActivityInsert(
		userId: string,
		postId: string,
		decision: Decision,
		source: "llm" | "cache",
	): ActivityInsert {
		return {
			userId,
			postId,
			decision,
			source,
		};
	}

	function toEventAttemptStatus(source: "llm" | "error"): "success" | "error" {
		return source === "llm" ? "success" : "error";
	}

	function toAttemptResponsePayload(
		decision: Decision,
		llmResult: LlmResult,
	): JsonObject {
		const providerErrorMessage = resolveProviderErrorMessage(llmResult);

		return {
			source: llmResult.source,
			decision,
			scores: llmResult.scores,
			model: llmResult.model,
			latency: llmResult.latency,
			...(llmResult.provider_http_status !== undefined
				? { provider_http_status: llmResult.provider_http_status }
				: {}),
			...(llmResult.provider_error_code !== undefined
				? { provider_error_code: llmResult.provider_error_code }
				: {}),
			...(llmResult.provider_error_type !== undefined
				? { provider_error_type: llmResult.provider_error_type }
				: {}),
			...(providerErrorMessage !== undefined
				? { provider_error_message: providerErrorMessage }
				: {}),
		};
	}

	function toLlmInput(post: NormalizedPost): LlmPostInput {
		return {
			post_id: post.post_id,
			author_id: post.author_id,
			author_name: post.author_name,
			nodes: post.nodes.map((node) => ({ ...node })),
			attachments: post.attachments.map((attachment) => ({ ...attachment })),
		};
	}

	async function appendClassificationAttempt(
		post: NormalizedPost,
		llmInput: LlmPostInput,
		decision: Decision,
		llmResult: LlmResult,
	): Promise<void> {
		const providerErrorMessage = resolveProviderErrorMessage(llmResult);

		await deps.classificationEventRepository.append({
			contentFingerprint: post.fingerprint,
			postId: post.post_id,
			model: llmResult.model,
			attemptStatus: toEventAttemptStatus(llmResult.source),
			...(llmResult.provider_http_status !== undefined
				? { providerHttpStatus: llmResult.provider_http_status }
				: {}),
			...(llmResult.provider_error_code !== undefined
				? { providerErrorCode: llmResult.provider_error_code }
				: {}),
			...(llmResult.provider_error_type !== undefined
				? { providerErrorType: llmResult.provider_error_type }
				: {}),
			...(providerErrorMessage !== undefined
				? { providerErrorMessage: providerErrorMessage }
				: {}),
			requestPayload: {
				post_id: post.post_id,
				canonical_content: post.canonicalContent,
				llm_request: llmInput,
			},
			responsePayload: toAttemptResponsePayload(decision, llmResult),
		});
	}

	async function classifyMiss(
		userId: string,
		post: NormalizedPost,
	): Promise<
		ClassificationResponse | { post_id: string; error: "quota_exceeded" }
	> {
		const consumed = await deps.quotaService.tryConsumeQuota(userId);
		if (!consumed.allowed) {
			return {
				post_id: post.post_id,
				error: "quota_exceeded",
			};
		}

		const llmInput = toLlmInput(post);
		const llmResult = await deps.llmService.classifyPost(llmInput);

		const scoringEngine = await getScoringEngine();
		const scored = scoringEngine.score(llmResult.scores);

		await appendClassificationAttempt(
			post,
			llmInput,
			scored.decision,
			llmResult,
		);

		if (llmResult.source === "llm") {
			await deps.classificationCacheRepository.upsertSuccess({
				contentFingerprint: post.fingerprint,
				postId: post.post_id,
				authorId: post.author_id,
				authorName: post.author_name,
				canonicalContent: post.canonicalContent,
				decision: scored.decision,
				source: "llm",
				model: llmResult.model,
				scoresJson: llmResult.scores ?? {},
			});

			await deps.activityRepository.insertActivity(
				toActivityInsert(userId, post.post_id, scored.decision, "llm"),
			);
		}

		return {
			post_id: post.post_id,
			decision: scored.decision,
			source: llmResult.source,
		};
	}

	async function classifySingle(
		userId: string,
		post: ClassifyInputPost,
	): Promise<ClassificationResponse> {
		const normalized = normalizePost(post);
		const cached =
			await deps.classificationCacheRepository.findFreshByFingerprint(
				normalized.fingerprint,
				getCacheExpiry(),
			);

		if (cached) {
			logCacheDecision(normalized.post_id, cached.decision);
			await deps.activityRepository.insertActivity(
				toActivityInsert(userId, normalized.post_id, cached.decision, "cache"),
			);
			return {
				post_id: normalized.post_id,
				decision: cached.decision,
				source: "cache",
			};
		}

		const missResult = await classifyMiss(userId, normalized);
		if ("error" in missResult) {
			throw new QuotaExceededError();
		}

		return missResult;
	}

	async function classifyBatchStream(
		userId: string,
		posts: ClassifyInputPost[],
		onOutcome: (outcome: BatchClassificationResponse) => Promise<void> | void,
	): Promise<void> {
		const normalizedPosts = posts.map(normalizePost);
		const cachedByFingerprint =
			await deps.classificationCacheRepository.findFreshByFingerprints(
				normalizedPosts.map((postItem) => postItem.fingerprint),
				getCacheExpiry(),
			);
		const misses: NormalizedPost[] = [];

		for (const post of normalizedPosts) {
			const cached = cachedByFingerprint.get(post.fingerprint);
			if (cached) {
				logCacheDecision(post.post_id, cached.decision);
				await deps.activityRepository.insertActivity(
					toActivityInsert(userId, post.post_id, cached.decision, "cache"),
				);
				await onOutcome({
					post_id: post.post_id,
					decision: cached.decision,
					source: "cache",
				});
				continue;
			}

			misses.push(post);
		}

		const queue = [...misses];
		const workers = Array.from(
			{ length: Math.min(deps.batchLlmConcurrency, queue.length) },
			async () => {
				while (queue.length > 0) {
					const next = queue.shift();
					if (!next) {
						return;
					}

					let outcome: BatchClassificationResponse;
					try {
						outcome = await classifyMiss(userId, next);
					} catch (_error) {
						outcome = {
							post_id: next.post_id,
							decision: "keep",
							source: "error",
						};
					}
					await onOutcome(outcome);
				}
			},
		);

		await Promise.all(workers);
	}

	async function hasAvailableQuota(userId: string): Promise<boolean> {
		const status = await deps.quotaService.getQuotaStatus(userId);
		return status.allowed;
	}

	return {
		classifySingle,
		classifyBatchStream,
		hasAvailableQuota,
	};
}
