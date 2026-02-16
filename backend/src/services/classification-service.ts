import {
	computeContentFingerprint,
	type ContentFingerprintInput,
} from "../lib/content-fingerprint";
import type {
	ClassificationCacheRepository,
	UpsertClassificationCacheInput,
} from "../repositories/classification-cache-repository";
import type {
	ActivityInsert,
	ActivityRepository,
} from "../repositories/activity-repository";
import type {
	AppendClassificationErrorEventInput,
	ClassificationEventRepository,
} from "../repositories/classification-event-repository";
import type { AppLogger } from "../lib/logger-types";
import type { MultimodalClassifyPost } from "../types/multimodal";
import type { Decision } from "../types/classification";
import type { LlmService, PostInput as LlmPostInput } from "./llm";
import type { QuotaService, QuotaStatus } from "./quota";
import type { ScoringEngine as ScoringEngineType } from "./scoring";

const CACHE_LOOKBACK_DAYS = 30;
const MIN_SOFT_QUOTA_BURST = 1;

type LlmResult = Awaited<ReturnType<LlmService["classifyPost"]>>;

type NormalizedPost = ClassifyInputPost & {
	fingerprint: string;
};

interface ClassificationBuffers {
	cacheWrites: UpsertClassificationCacheInput[];
	activityWrites: ActivityInsert[];
	errorEvents: AppendClassificationErrorEventInput[];
	usageIncrementCount: number;
}

interface MissClassificationResult {
	outcome: ClassificationResponse;
	cacheWrite?: UpsertClassificationCacheInput;
	activityWrite?: ActivityInsert;
	errorEvent?: AppendClassificationErrorEventInput;
	usageIncrementCount: number;
}

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

function normalizePost(post: ClassifyInputPost): NormalizedPost {
	const fingerprintInput: ContentFingerprintInput = {
		post_id: post.post_id,
		author_id: post.author_id,
		author_name: post.author_name,
		nodes: post.nodes.map((node) => ({ ...node })),
		attachments: post.attachments.map((attachment) => ({ ...attachment })),
	};

	return {
		...post,
		fingerprint: computeContentFingerprint(fingerprintInput),
	};
}

function getCacheExpiry(): Date {
	const cacheExpiry = new Date();
	cacheExpiry.setDate(cacheExpiry.getDate() - CACHE_LOOKBACK_DAYS);
	return cacheExpiry;
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

function resolveUnexpectedErrorMessage(error: unknown): string {
	if (error instanceof Error && error.message.trim().length > 0) {
		return error.message;
	}

	return "llm_error:unknown";
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

function toLlmInput(post: NormalizedPost): LlmPostInput {
	return {
		post_id: post.post_id,
		author_id: post.author_id,
		author_name: post.author_name,
		nodes: post.nodes.map((node) => ({ ...node })),
		attachments: post.attachments.map((attachment) => ({ ...attachment })),
	};
}

function createEmptyBuffers(): ClassificationBuffers {
	return {
		cacheWrites: [],
		activityWrites: [],
		errorEvents: [],
		usageIncrementCount: 0,
	};
}

function addMissResultToBuffers(
	buffers: ClassificationBuffers,
	result: MissClassificationResult,
): void {
	if (result.cacheWrite) {
		buffers.cacheWrites.push(result.cacheWrite);
	}
	if (result.activityWrite) {
		buffers.activityWrites.push(result.activityWrite);
	}
	if (result.errorEvent) {
		buffers.errorEvents.push(result.errorEvent);
	}
	buffers.usageIncrementCount += result.usageIncrementCount;
}

function buildSoftQuotaBudget(
	quotaStatus: QuotaStatus,
	batchLlmConcurrency: number,
): number {
	if (quotaStatus.limit <= 0 || quotaStatus.periodStart.length === 0) {
		return 0;
	}

	const softBurst = Math.max(
		MIN_SOFT_QUOTA_BURST,
		Math.max(1, batchLlmConcurrency),
	);

	return Math.max(0, quotaStatus.remaining + softBurst);
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

	async function classifyMiss(
		userId: string,
		post: NormalizedPost,
	): Promise<MissClassificationResult> {
		const llmInput = toLlmInput(post);

		try {
			const llmResult = await deps.llmService.classifyPost(llmInput);
			const scoringEngine = await getScoringEngine();
			const scored = scoringEngine.score(llmResult.scores);

			if (llmResult.source === "llm") {
				return {
					outcome: {
						post_id: post.post_id,
						decision: scored.decision,
						source: "llm",
					},
					cacheWrite: {
						contentFingerprint: post.fingerprint,
						decision: scored.decision,
					},
					activityWrite: toActivityInsert(
						userId,
						post.post_id,
						scored.decision,
						"llm",
					),
					usageIncrementCount: 1,
				};
			}

			return {
				outcome: {
					post_id: post.post_id,
					decision: scored.decision,
					source: "error",
				},
				errorEvent: {
					contentFingerprint: post.fingerprint,
					postId: post.post_id,
					...(llmResult.provider_http_status !== undefined
						? { providerHttpStatus: llmResult.provider_http_status }
						: {}),
					...(llmResult.provider_error_code !== undefined
						? { providerErrorCode: llmResult.provider_error_code }
						: {}),
					...(llmResult.provider_error_type !== undefined
						? { providerErrorType: llmResult.provider_error_type }
						: {}),
					providerErrorMessage: resolveProviderErrorMessage(llmResult),
				},
				usageIncrementCount: 1,
			};
		} catch (error) {
			return {
				outcome: {
					post_id: post.post_id,
					decision: "keep",
					source: "error",
				},
				errorEvent: {
					contentFingerprint: post.fingerprint,
					postId: post.post_id,
					providerErrorMessage: resolveUnexpectedErrorMessage(error),
				},
				usageIncrementCount: 1,
			};
		}
	}

	async function flushBuffers(
		userId: string,
		buffers: ClassificationBuffers,
		periodStart: string,
	): Promise<void> {
		const flushSteps: Array<{ name: string; run: () => Promise<void> }> = [];
		if (buffers.cacheWrites.length > 0) {
			flushSteps.push({
				name: "cache_upsert_many",
				run: async () => {
					await deps.classificationCacheRepository.upsertMany(
						buffers.cacheWrites,
					);
				},
			});
		}
		if (buffers.activityWrites.length > 0) {
			flushSteps.push({
				name: "activity_insert_many",
				run: async () => {
					await deps.activityRepository.insertMany(buffers.activityWrites);
				},
			});
		}
		if (buffers.usageIncrementCount > 0) {
			flushSteps.push({
				name: "quota_increment_usage_by",
				run: async () => {
					await deps.quotaService.incrementUsageBy(
						userId,
						buffers.usageIncrementCount,
						periodStart,
					);
				},
			});
		}
		if (buffers.errorEvents.length > 0) {
			flushSteps.push({
				name: "classification_error_events_append_many",
				run: async () => {
					await deps.classificationEventRepository.appendMany(
						buffers.errorEvents,
					);
				},
			});
		}
		if (flushSteps.length === 0) {
			return;
		}

		await Promise.all(
			flushSteps.map(async (step) => {
				try {
					await step.run();
				} catch (error) {
					deps.logger.info("classification_flush_failed", {
						step: step.name,
						error: error instanceof Error ? error.message : String(error),
						cacheWriteCount: buffers.cacheWrites.length,
						activityWriteCount: buffers.activityWrites.length,
						errorEventCount: buffers.errorEvents.length,
						usageIncrementCount: buffers.usageIncrementCount,
					});
				}
			}),
		);
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
		const buffers = createEmptyBuffers();

		if (cached) {
			logCacheDecision(normalized.post_id, cached.decision);
			buffers.activityWrites.push(
				toActivityInsert(userId, normalized.post_id, cached.decision, "cache"),
			);
			await flushBuffers(userId, buffers, "");
			return {
				post_id: normalized.post_id,
				decision: cached.decision,
				source: "cache",
			};
		}

		const quotaStatus = await deps.quotaService.getQuotaStatus(userId);
		if (
			quotaStatus.limit <= 0 ||
			quotaStatus.periodStart.length === 0 ||
			quotaStatus.remaining <= 0
		) {
			throw new QuotaExceededError();
		}

		const missResult = await classifyMiss(userId, normalized);
		addMissResultToBuffers(buffers, missResult);
		await flushBuffers(userId, buffers, quotaStatus.periodStart);
		return missResult.outcome;
	}

	async function classifyBatchStream(
		userId: string,
		posts: ClassifyInputPost[],
		onOutcome: (outcome: BatchClassificationResponse) => Promise<void> | void,
	): Promise<void> {
		const normalizedPosts = posts.map(normalizePost);
		const [cachedByFingerprint, quotaStatus] = await Promise.all([
			deps.classificationCacheRepository.findFreshByFingerprints(
				normalizedPosts.map((postItem) => postItem.fingerprint),
				getCacheExpiry(),
			),
			deps.quotaService.getQuotaStatus(userId),
		]);

		const buffers = createEmptyBuffers();
		const missesToClassify: NormalizedPost[] = [];
		let allowedMisses = buildSoftQuotaBudget(
			quotaStatus,
			deps.batchLlmConcurrency,
		);

		for (const postItem of normalizedPosts) {
			const cached = cachedByFingerprint.get(postItem.fingerprint);
			if (cached) {
				logCacheDecision(postItem.post_id, cached.decision);
				buffers.activityWrites.push(
					toActivityInsert(userId, postItem.post_id, cached.decision, "cache"),
				);
				await onOutcome({
					post_id: postItem.post_id,
					decision: cached.decision,
					source: "cache",
				});
				continue;
			}

			if (allowedMisses <= 0) {
				await onOutcome({
					post_id: postItem.post_id,
					error: "quota_exceeded",
				});
				continue;
			}

			allowedMisses -= 1;
			missesToClassify.push(postItem);
		}

		const queue = [...missesToClassify];
		const workerCount =
			queue.length === 0
				? 0
				: Math.max(1, Math.min(deps.batchLlmConcurrency, queue.length));
		const workers = Array.from({ length: workerCount }, async () => {
			while (queue.length > 0) {
				const next = queue.shift();
				if (!next) {
					return;
				}

				const missResult = await classifyMiss(userId, next);
				addMissResultToBuffers(buffers, missResult);
				await onOutcome(missResult.outcome);
			}
		});

		await Promise.all(workers);
		await flushBuffers(userId, buffers, quotaStatus.periodStart);
	}

	return {
		classifySingle,
		classifyBatchStream,
	};
}
