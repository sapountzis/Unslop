import {
	computeContentFingerprint,
	type ContentFingerprintInput,
} from "../lib/content-fingerprint";
import type {
	ClassificationCacheRepository,
	InsertClassificationCacheInput,
} from "../repositories/classification-cache-repository";
import type {
	ActivityInsert,
	ActivityRepository,
} from "../repositories/activity-repository";
import type {
	AppendClassificationSuccessEventInput,
	ClassificationEventRepository,
} from "../repositories/classification-event-repository";
import type { AppLogger } from "../lib/logger-types";
import type { MultimodalClassifyPost } from "../types/multimodal";
import type { Decision, ScoreResult } from "../types/classification";
import type { LlmService, PostInput as LlmPostInput } from "./llm";
import type { QuotaService, QuotaStatus } from "./quota";
import type { ScoringEngine as ScoringEngineType } from "./scoring";

const MIN_SOFT_QUOTA_BURST = 1;

type NormalizedPost = ClassifyInputPost & {
	fingerprint: string;
};

interface ClassificationBuffers {
	cacheWrites: InsertClassificationCacheInput[];
	activityWrites: ActivityInsert[];
	successEvents: AppendClassificationSuccessEventInput[];
	usageIncrementCount: number;
}

interface MissClassificationResult {
	outcome: ClassificationResponse;
	cacheWrite?: InsertClassificationCacheInput;
	activityWrite?: ActivityInsert;
	successEvent?: AppendClassificationSuccessEventInput;
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
		text: post.text,
		attachments: post.attachments.map((attachment) => ({ ...attachment })),
	};

	return {
		...post,
		fingerprint: computeContentFingerprint(fingerprintInput),
	};
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
		text: post.text,
		attachments: post.attachments.map((attachment) => ({ ...attachment })),
	};
}

function toRequestPayload(post: NormalizedPost): Record<string, unknown> {
	return {
		post_id: post.post_id,
		text: post.text,
		attachments: post.attachments.map((a) => {
			if (a.kind === "image") {
				return {
					kind: "image",
					ordinal: a.ordinal,
					base64: a.base64,
					mime_type: a.mime_type,
				};
			}
			return {
				kind: "pdf",
				ordinal: a.ordinal,
				source_url: a.source_url,
				excerpt_text: a.excerpt_text,
			};
		}),
	};
}

function convertScoreResultToRecord(
	scores: ScoreResult | null,
): Record<string, number> | null {
	if (!scores) return null;
	const result: Record<string, number> = {};
	for (const [key, value] of Object.entries(scores)) {
		if (typeof value === "number") {
			result[key] = value;
		}
	}
	return result;
}

function toResponsePayload(
	model: string,
	scores: Record<string, number> | null,
	latency: number,
	decision: string,
): Record<string, unknown> {
	return {
		model,
		scores: scores ?? {},
		source: "llm",
		latency,
		decision,
	};
}

function createEmptyBuffers(): ClassificationBuffers {
	return {
		cacheWrites: [],
		activityWrites: [],
		successEvents: [],
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
	if (result.successEvent) {
		buffers.successEvents.push(result.successEvent);
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
					successEvent: {
						contentFingerprint: post.fingerprint,
						postId: post.post_id,
						model: llmResult.model,
						decision: scored.decision,
						requestPayload: toRequestPayload(post),
						responsePayload: toResponsePayload(
							llmResult.model,
							convertScoreResultToRecord(llmResult.scores),
							llmResult.latency,
							scored.decision,
						),
					},
					usageIncrementCount: 1,
				};
			}

			return {
				outcome: {
					post_id: post.post_id,
					decision: scored.decision,
					source: "error",
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
				name: "cache_insert_many",
				run: async () => {
					await deps.classificationCacheRepository.insertMany(
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
		if (buffers.successEvents.length > 0) {
			flushSteps.push({
				name: "classification_success_events_append_many",
				run: async () => {
					await deps.classificationEventRepository.appendMany(
						buffers.successEvents,
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
					const err = error instanceof Error ? error : new Error(String(error));
					const cause =
						"cause" in err && err.cause instanceof Error
							? err.cause.message
							: undefined;
					deps.logger.info("classification_flush_failed", {
						step: step.name,
						error: err.message,
						...(cause !== undefined && { cause }),
						cacheWriteCount: buffers.cacheWrites.length,
						activityWriteCount: buffers.activityWrites.length,
						successEventCount: buffers.successEvents.length,
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
		const cached = await deps.classificationCacheRepository.findByFingerprint(
			normalized.fingerprint,
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
			deps.classificationCacheRepository.findByFingerprints(
				normalizedPosts.map((postItem) => postItem.fingerprint),
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
