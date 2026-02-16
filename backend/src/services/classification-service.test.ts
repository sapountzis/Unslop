import { describe, expect, it, mock } from "bun:test";
import { computeContentFingerprint } from "../lib/content-fingerprint";
import type {
	ClassificationCacheRepository,
	ClassificationCacheRow,
} from "../repositories/classification-cache-repository";
import type { ClassificationEventRepository } from "../repositories/classification-event-repository";
import type { ActivityRepository } from "../repositories/activity-repository";
import type { QuotaService } from "./quota";
import type { LlmService } from "./llm";
import type { ScoreResult } from "../types/classification";
import {
	type BatchClassificationResponse,
	createClassificationService,
	QuotaExceededError,
} from "./classification-service";

process.env.TEST_MODE = process.env.TEST_MODE || "true";
process.env.DATABASE_URL =
	process.env.DATABASE_URL ||
	"postgres://postgres:postgres@localhost:5432/unslop_test";
process.env.APP_URL = process.env.APP_URL || "http://localhost:3000";
process.env.MAGIC_LINK_BASE_URL =
	process.env.MAGIC_LINK_BASE_URL || "http://localhost:3000";
process.env.VLM_MODEL = process.env.VLM_MODEL || "test-vlm";

const fullScores: ScoreResult = {
	u: 0.1,
	d: 0.1,
	c: 0.1,
	rb: 0.1,
	eb: 0.1,
	sp: 0.1,
	p: 0.1,
	x: 0.1,
};

const post = {
	post_id: "post-1",
	author_id: "author-1",
	author_name: "Author One",
	nodes: [
		{ id: "root", parent_id: null, kind: "root" as const, text: "Hello world" },
		{
			id: "node-2",
			parent_id: "root",
			kind: "repost" as const,
			text: "Follow up",
		},
	],
	attachments: [],
};

const postTwo = {
	post_id: "post-2",
	author_id: "author-2",
	author_name: "Author Two",
	nodes: [
		{ id: "root", parent_id: null, kind: "root" as const, text: "Second post" },
	],
	attachments: [],
};

const postThree = {
	post_id: "post-3",
	author_id: "author-3",
	author_name: "Author Three",
	nodes: [
		{ id: "root", parent_id: null, kind: "root" as const, text: "Third post" },
	],
	attachments: [],
};

const postFour = {
	post_id: "post-4",
	author_id: "author-4",
	author_name: "Author Four",
	nodes: [
		{ id: "root", parent_id: null, kind: "root" as const, text: "Fourth post" },
	],
	attachments: [],
};

function createPost(index: number): typeof post {
	return {
		post_id: `post-${index}`,
		author_id: `author-${index}`,
		author_name: `Author ${index}`,
		nodes: [
			{
				id: "root",
				parent_id: null,
				kind: "root" as const,
				text: `Post ${index}`,
			},
		],
		attachments: [],
	};
}

function createQuotaService(
	overrides: Partial<QuotaService> = {},
): QuotaService {
	return {
		getQuotaStatus: mock(async () => ({
			allowed: true,
			currentUsage: 0,
			limit: 300,
			plan: "free",
			remaining: 300,
			periodStart: "2026-02-01",
			isPro: false,
		})),
		checkQuota: mock(async () => ({
			allowed: true,
			currentUsage: 0,
			limit: 300,
			plan: "free",
		})),
		incrementUsageBy: mock(async () => undefined),
		incrementUsage: mock(async () => undefined),
		...overrides,
	};
}

function createActivityRepository(
	overrides: Partial<ActivityRepository> = {},
): ActivityRepository {
	return {
		insertMany: mock(async () => undefined),
		...overrides,
	};
}

function createCacheRepository(
	overrides: Partial<ClassificationCacheRepository> = {},
): ClassificationCacheRepository {
	return {
		findFreshByFingerprint: mock(async () => null),
		findFreshByFingerprints: mock(async () => new Map()),
		upsertMany: mock(async () => undefined),
		...overrides,
	};
}

function createEventRepository(
	overrides: Partial<ClassificationEventRepository> = {},
): ClassificationEventRepository {
	return {
		appendMany: mock(async () => undefined),
		...overrides,
	};
}

function createLlmService(overrides: Partial<LlmService> = {}): LlmService {
	return {
		classifyPost: mock(async () => ({
			scores: fullScores,
			source: "llm" as const,
			model: "openrouter/mock",
			latency: 1,
		})),
		...overrides,
	};
}

async function collectBatchOutcomes(
	service: ReturnType<typeof createClassificationService>,
	userId: string,
	posts: (typeof post)[],
): Promise<BatchClassificationResponse[]> {
	const outcomes: BatchClassificationResponse[] = [];
	await service.classifyBatchStream(userId, posts, (outcome) => {
		outcomes.push(outcome);
	});
	return outcomes;
}

describe("classification service", () => {
	it("classifySingle cache hit skips quota/llm and writes cache activity", async () => {
		const findFreshByFingerprint = mock(async () => ({
			contentFingerprint: "fp-cache",
			decision: "hide" as const,
			createdAt: new Date(),
			updatedAt: new Date(),
		}));
		const getQuotaStatus = mock(async () => ({
			allowed: true,
			currentUsage: 0,
			limit: 300,
			plan: "free",
			remaining: 300,
			periodStart: "2026-02-01",
			isPro: false,
		}));
		const classifyPost = mock(async () => ({
			scores: fullScores,
			source: "llm" as const,
			model: "openrouter/mock",
			latency: 1,
		}));
		const insertMany = mock(async () => undefined);
		const incrementUsageBy = mock(async () => undefined);

		const service = createClassificationService({
			llmService: createLlmService({ classifyPost }),
			quotaService: createQuotaService({ getQuotaStatus, incrementUsageBy }),
			classificationCacheRepository: createCacheRepository({
				findFreshByFingerprint,
			}),
			classificationEventRepository: createEventRepository(),
			activityRepository: createActivityRepository({ insertMany }),
			logger: { info: mock(() => undefined) },
			batchLlmConcurrency: 2,
		});

		const outcome = await service.classifySingle("user-1", post);

		expect(outcome).toEqual({
			post_id: post.post_id,
			decision: "hide",
			source: "cache",
		});
		expect(findFreshByFingerprint).toHaveBeenCalledWith(
			computeContentFingerprint(post),
			expect.any(Date),
		);
		expect(getQuotaStatus).not.toHaveBeenCalled();
		expect(classifyPost).not.toHaveBeenCalled();
		expect(insertMany).toHaveBeenCalledWith([
			{
				userId: "user-1",
				postId: post.post_id,
				decision: "hide",
				source: "cache",
			},
		]);
		expect(incrementUsageBy).not.toHaveBeenCalled();
	});

	it("classifySingle miss uses one quota snapshot and one bulk flush", async () => {
		const getQuotaStatus = mock(async () => ({
			allowed: true,
			currentUsage: 10,
			limit: 300,
			plan: "free",
			remaining: 290,
			periodStart: "2026-02-01",
			isPro: false,
		}));
		const classifyPost = mock(async () => ({
			scores: fullScores,
			source: "llm" as const,
			model: "openrouter/mock",
			latency: 5,
		}));
		const upsertMany = mock(async () => undefined);
		const insertMany = mock(async () => undefined);
		const incrementUsageBy = mock(async () => undefined);
		const appendMany = mock(async () => undefined);

		const service = createClassificationService({
			llmService: createLlmService({ classifyPost }),
			quotaService: createQuotaService({ getQuotaStatus, incrementUsageBy }),
			classificationCacheRepository: createCacheRepository({ upsertMany }),
			classificationEventRepository: createEventRepository({ appendMany }),
			activityRepository: createActivityRepository({ insertMany }),
			logger: { info: mock(() => undefined) },
			batchLlmConcurrency: 2,
		});

		const outcome = await service.classifySingle("user-1", post);

		expect(outcome).toEqual({
			post_id: post.post_id,
			decision: "keep",
			source: "llm",
		});
		expect(getQuotaStatus).toHaveBeenCalledTimes(1);
		expect(classifyPost).toHaveBeenCalledTimes(1);
		expect(upsertMany).toHaveBeenCalledWith([
			{ contentFingerprint: computeContentFingerprint(post), decision: "keep" },
		]);
		expect(insertMany).toHaveBeenCalledWith([
			{
				userId: "user-1",
				postId: post.post_id,
				decision: "keep",
				source: "llm",
			},
		]);
		expect(incrementUsageBy).toHaveBeenCalledWith("user-1", 1, "2026-02-01");
		expect(appendMany).not.toHaveBeenCalled();
	});

	it("classifySingle throws quota_exceeded when snapshot has no remaining budget", async () => {
		const getQuotaStatus = mock(async () => ({
			allowed: false,
			currentUsage: 300,
			limit: 300,
			plan: "free",
			remaining: 0,
			periodStart: "2026-02-01",
			isPro: false,
		}));
		const classifyPost = mock(async () => ({
			scores: fullScores,
			source: "llm" as const,
			model: "openrouter/mock",
			latency: 1,
		}));

		const service = createClassificationService({
			llmService: createLlmService({ classifyPost }),
			quotaService: createQuotaService({ getQuotaStatus }),
			classificationCacheRepository: createCacheRepository(),
			classificationEventRepository: createEventRepository(),
			activityRepository: createActivityRepository(),
			logger: { info: mock(() => undefined) },
			batchLlmConcurrency: 2,
		});

		await expect(service.classifySingle("user-1", post)).rejects.toBeInstanceOf(
			QuotaExceededError,
		);
		expect(classifyPost).not.toHaveBeenCalled();
	});

	it("classifyBatchStream applies soft quota budget and flushes in bulk", async () => {
		const getQuotaStatus = mock(async () => ({
			allowed: false,
			currentUsage: 300,
			limit: 300,
			plan: "free",
			remaining: 0,
			periodStart: "2026-02-01",
			isPro: false,
		}));
		const classifyPost = mock(async (input: { post_id: string }) => {
			if (input.post_id === post.post_id) {
				return {
					scores: fullScores,
					source: "llm" as const,
					model: "openrouter/mock",
					latency: 2,
				};
			}

			return {
				scores: null,
				source: "error" as const,
				model: "openrouter/mock",
				latency: 2,
				provider_http_status: 503,
				provider_error_code: "upstream_unavailable",
			};
		});
		const upsertMany = mock(async () => undefined);
		const insertMany = mock(async () => undefined);
		const appendMany = mock(async () => undefined);
		const incrementUsageBy = mock(async () => undefined);

		const service = createClassificationService({
			llmService: createLlmService({ classifyPost }),
			quotaService: createQuotaService({ getQuotaStatus, incrementUsageBy }),
			classificationCacheRepository: createCacheRepository({ upsertMany }),
			classificationEventRepository: createEventRepository({ appendMany }),
			activityRepository: createActivityRepository({ insertMany }),
			logger: { info: mock(() => undefined) },
			batchLlmConcurrency: 2,
		});

		const outcomes = await collectBatchOutcomes(service, "user-1", [
			post,
			postTwo,
			postThree,
			postFour,
		]);

		expect(classifyPost).toHaveBeenCalledTimes(2);
		expect(incrementUsageBy).toHaveBeenCalledWith("user-1", 2, "2026-02-01");
		expect(upsertMany).toHaveBeenCalledWith([
			{ contentFingerprint: computeContentFingerprint(post), decision: "keep" },
		]);
		expect(insertMany).toHaveBeenCalledWith([
			{
				userId: "user-1",
				postId: post.post_id,
				decision: "keep",
				source: "llm",
			},
		]);
		expect(appendMany).toHaveBeenCalledWith([
			expect.objectContaining({
				contentFingerprint: computeContentFingerprint(postTwo),
				postId: postTwo.post_id,
				providerHttpStatus: 503,
				providerErrorCode: "upstream_unavailable",
			}),
		]);

		const outcomeByPostId = new Map(
			outcomes.map((outcome) => [outcome.post_id, outcome]),
		);
		expect(outcomeByPostId.get(post.post_id)).toEqual({
			post_id: post.post_id,
			decision: "keep",
			source: "llm",
		});
		expect(outcomeByPostId.get(postTwo.post_id)).toEqual({
			post_id: postTwo.post_id,
			decision: "keep",
			source: "error",
		});
		expect(outcomeByPostId.get(postThree.post_id)).toEqual({
			post_id: postThree.post_id,
			error: "quota_exceeded",
		});
		expect(outcomeByPostId.get(postFour.post_id)).toEqual({
			post_id: postFour.post_id,
			error: "quota_exceeded",
		});
	});

	it("classifyBatchStream emits cache outcomes before slow miss completes", async () => {
		const postFingerprint = computeContentFingerprint(post);
		const findFreshByFingerprints = mock(async () => {
			const hits = new Map<string, ClassificationCacheRow>();
			hits.set(postFingerprint, {
				contentFingerprint: postFingerprint,
				decision: "hide" as const,
				createdAt: new Date(),
				updatedAt: new Date(),
			});
			return hits;
		});
		const getQuotaStatus = mock(async () => ({
			allowed: true,
			currentUsage: 0,
			limit: 300,
			plan: "free",
			remaining: 300,
			periodStart: "2026-02-01",
			isPro: false,
		}));

		let releaseSlowLlm!: () => void;
		const slowLlmGate = new Promise<void>((resolve) => {
			releaseSlowLlm = () => resolve();
		});
		const classifyPost = mock(async () => {
			await slowLlmGate;
			return {
				scores: fullScores,
				source: "llm" as const,
				model: "openrouter/mock",
				latency: 4,
			};
		});

		const service = createClassificationService({
			llmService: createLlmService({ classifyPost }),
			quotaService: createQuotaService({ getQuotaStatus }),
			classificationCacheRepository: createCacheRepository({
				findFreshByFingerprints,
			}),
			classificationEventRepository: createEventRepository(),
			activityRepository: createActivityRepository(),
			logger: { info: mock(() => undefined) },
			batchLlmConcurrency: 2,
		});

		const outcomes: BatchClassificationResponse[] = [];
		let firstOutcomeResolve!: () => void;
		const firstOutcome = new Promise<void>((resolve) => {
			firstOutcomeResolve = resolve;
		});

		const streamPromise = service.classifyBatchStream(
			"user-1",
			[post, postTwo],
			(result) => {
				outcomes.push(result);
				if (outcomes.length === 1) {
					firstOutcomeResolve();
				}
			},
		);

		await firstOutcome;
		expect(outcomes[0]).toEqual({
			post_id: post.post_id,
			decision: "hide",
			source: "cache",
		});

		releaseSlowLlm();
		await streamPromise;

		expect(outcomes).toHaveLength(2);
		expect(outcomes[1]).toEqual({
			post_id: postTwo.post_id,
			decision: "keep",
			source: "llm",
		});
	});

	it("classifyBatchStream keeps streamed outcomes even if final flush fails", async () => {
		const upsertMany = mock(async () => {
			throw new Error("cache down");
		});
		const insertMany = mock(async () => undefined);
		const incrementUsageBy = mock(async () => undefined);
		const logInfo = mock(() => undefined);

		const service = createClassificationService({
			llmService: createLlmService(),
			quotaService: createQuotaService({ incrementUsageBy }),
			classificationCacheRepository: createCacheRepository({ upsertMany }),
			classificationEventRepository: createEventRepository(),
			activityRepository: createActivityRepository({ insertMany }),
			logger: { info: logInfo },
			batchLlmConcurrency: 2,
		});

		const outcomes = await collectBatchOutcomes(service, "user-1", [post]);

		expect(outcomes).toEqual([
			{ post_id: post.post_id, decision: "keep", source: "llm" },
		]);
		expect(insertMany).toHaveBeenCalledTimes(1);
		expect(incrementUsageBy).toHaveBeenCalledTimes(1);
		expect(logInfo).toHaveBeenCalledWith(
			"classification_flush_failed",
			expect.objectContaining({
				step: "cache_upsert_many",
				error: "cache down",
			}),
		);
	});

	it("classifyBatchStream keeps db pressure constant for large all-miss batches", async () => {
		const posts = Array.from({ length: 20 }, (_, index) =>
			createPost(index + 1),
		);
		const getQuotaStatus = mock(async () => ({
			allowed: true,
			currentUsage: 0,
			limit: 300,
			plan: "free",
			remaining: 300,
			periodStart: "2026-02-01",
			isPro: false,
		}));
		const findFreshByFingerprints = mock(async () => new Map());
		const classifyPost = mock(async () => ({
			scores: fullScores,
			source: "llm" as const,
			model: "openrouter/mock",
			latency: 3,
		}));
		const upsertMany = mock(async () => undefined);
		const insertMany = mock(async () => undefined);
		const incrementUsageBy = mock(async () => undefined);
		const appendMany = mock(async () => undefined);

		const service = createClassificationService({
			llmService: createLlmService({ classifyPost }),
			quotaService: createQuotaService({ getQuotaStatus, incrementUsageBy }),
			classificationCacheRepository: createCacheRepository({
				findFreshByFingerprints,
				upsertMany,
			}),
			classificationEventRepository: createEventRepository({ appendMany }),
			activityRepository: createActivityRepository({ insertMany }),
			logger: { info: mock(() => undefined) },
			batchLlmConcurrency: 4,
		});

		const outcomes = await collectBatchOutcomes(service, "user-1", posts);

		expect(getQuotaStatus).toHaveBeenCalledTimes(1);
		expect(findFreshByFingerprints).toHaveBeenCalledTimes(1);
		expect(findFreshByFingerprints).toHaveBeenCalledWith(
			posts.map((item) => computeContentFingerprint(item)),
			expect.any(Date),
		);
		expect(classifyPost).toHaveBeenCalledTimes(20);

		expect(upsertMany).toHaveBeenCalledTimes(1);
		const [cacheWrites] = upsertMany.mock.calls[0] as [
			{ contentFingerprint: string; decision: "keep" | "hide" }[],
		];
		expect(cacheWrites).toHaveLength(20);
		expect(cacheWrites).toEqual(
			expect.arrayContaining(
				posts.map((item) => ({
					contentFingerprint: computeContentFingerprint(item),
					decision: "keep",
				})),
			),
		);
		expect(insertMany).toHaveBeenCalledTimes(1);
		const [activityWrites] = insertMany.mock.calls[0] as [
			{
				userId: string;
				postId: string;
				decision: "keep" | "hide";
				source: "llm" | "cache";
			}[],
		];
		expect(activityWrites).toHaveLength(20);
		expect(activityWrites).toEqual(
			expect.arrayContaining(
				posts.map((item) => ({
					userId: "user-1",
					postId: item.post_id,
					decision: "keep",
					source: "llm",
				})),
			),
		);
		expect(incrementUsageBy).toHaveBeenCalledTimes(1);
		expect(incrementUsageBy).toHaveBeenCalledWith("user-1", 20, "2026-02-01");
		expect(appendMany).not.toHaveBeenCalled();

		expect(outcomes).toHaveLength(20);
		expect(
			outcomes.every(
				(item) =>
					"decision" in item &&
					item.decision === "keep" &&
					item.source === "llm",
			),
		).toBe(true);
	});

	it("classifyBatchStream keeps snapshot/read/write call counts flat from 1 to 20 misses", async () => {
		async function runAllMissBatch(batchSize: number) {
			const posts = Array.from({ length: batchSize }, (_, index) =>
				createPost(index + 1),
			);
			const getQuotaStatus = mock(async () => ({
				allowed: true,
				currentUsage: 0,
				limit: 300,
				plan: "free",
				remaining: 300,
				periodStart: "2026-02-01",
				isPro: false,
			}));
			const findFreshByFingerprints = mock(async () => new Map());
			const classifyPost = mock(async () => ({
				scores: fullScores,
				source: "llm" as const,
				model: "openrouter/mock",
				latency: 2,
			}));
			const upsertMany = mock(async () => undefined);
			const insertMany = mock(async () => undefined);
			const incrementUsageBy = mock(async () => undefined);

			const service = createClassificationService({
				llmService: createLlmService({ classifyPost }),
				quotaService: createQuotaService({ getQuotaStatus, incrementUsageBy }),
				classificationCacheRepository: createCacheRepository({
					findFreshByFingerprints,
					upsertMany,
				}),
				classificationEventRepository: createEventRepository(),
				activityRepository: createActivityRepository({ insertMany }),
				logger: { info: mock(() => undefined) },
				batchLlmConcurrency: 4,
			});

			const outcomes = await collectBatchOutcomes(service, "user-1", posts);
			return {
				outcomes,
				getQuotaStatus,
				findFreshByFingerprints,
				classifyPost,
				upsertMany,
				insertMany,
				incrementUsageBy,
			};
		}

		const small = await runAllMissBatch(1);
		const large = await runAllMissBatch(20);

		expect(small.getQuotaStatus).toHaveBeenCalledTimes(1);
		expect(large.getQuotaStatus).toHaveBeenCalledTimes(1);
		expect(small.findFreshByFingerprints).toHaveBeenCalledTimes(1);
		expect(large.findFreshByFingerprints).toHaveBeenCalledTimes(1);
		expect(small.upsertMany).toHaveBeenCalledTimes(1);
		expect(large.upsertMany).toHaveBeenCalledTimes(1);
		expect(small.insertMany).toHaveBeenCalledTimes(1);
		expect(large.insertMany).toHaveBeenCalledTimes(1);
		expect(small.incrementUsageBy).toHaveBeenCalledTimes(1);
		expect(large.incrementUsageBy).toHaveBeenCalledTimes(1);

		expect(small.classifyPost).toHaveBeenCalledTimes(1);
		expect(large.classifyPost).toHaveBeenCalledTimes(20);
		expect(small.incrementUsageBy).toHaveBeenCalledWith(
			"user-1",
			1,
			"2026-02-01",
		);
		expect(large.incrementUsageBy).toHaveBeenCalledWith(
			"user-1",
			20,
			"2026-02-01",
		);

		expect(small.outcomes).toHaveLength(1);
		expect(large.outcomes).toHaveLength(20);
	});

	it("classifyBatchStream merges cache-hit and llm activity into one bulk write", async () => {
		const posts = [createPost(1), createPost(2), createPost(3), createPost(4)];
		const cacheHitFingerprints = new Set([
			computeContentFingerprint(posts[0]),
			computeContentFingerprint(posts[1]),
		]);
		const findFreshByFingerprints = mock(async () => {
			const map = new Map<string, ClassificationCacheRow>();
			for (const fingerprint of cacheHitFingerprints) {
				map.set(fingerprint, {
					contentFingerprint: fingerprint,
					decision: "hide",
					createdAt: new Date(),
					updatedAt: new Date(),
				});
			}
			return map;
		});
		const getQuotaStatus = mock(async () => ({
			allowed: true,
			currentUsage: 0,
			limit: 300,
			plan: "free",
			remaining: 300,
			periodStart: "2026-02-01",
			isPro: false,
		}));
		const classifyPost = mock(async () => ({
			scores: fullScores,
			source: "llm" as const,
			model: "openrouter/mock",
			latency: 3,
		}));
		const upsertMany = mock(async () => undefined);
		const insertMany = mock(async () => undefined);
		const incrementUsageBy = mock(async () => undefined);

		const service = createClassificationService({
			llmService: createLlmService({ classifyPost }),
			quotaService: createQuotaService({ getQuotaStatus, incrementUsageBy }),
			classificationCacheRepository: createCacheRepository({
				findFreshByFingerprints,
				upsertMany,
			}),
			classificationEventRepository: createEventRepository(),
			activityRepository: createActivityRepository({ insertMany }),
			logger: { info: mock(() => undefined) },
			batchLlmConcurrency: 2,
		});

		const outcomes = await collectBatchOutcomes(service, "user-1", posts);

		expect(getQuotaStatus).toHaveBeenCalledTimes(1);
		expect(findFreshByFingerprints).toHaveBeenCalledTimes(1);
		expect(classifyPost).toHaveBeenCalledTimes(2);
		expect(upsertMany).toHaveBeenCalledTimes(1);
		const [cacheWrites] = upsertMany.mock.calls[0] as [
			{ contentFingerprint: string; decision: "keep" | "hide" }[],
		];
		expect(cacheWrites).toHaveLength(2);
		expect(cacheWrites).toEqual(
			expect.arrayContaining([
				{
					contentFingerprint: computeContentFingerprint(posts[2]),
					decision: "keep",
				},
				{
					contentFingerprint: computeContentFingerprint(posts[3]),
					decision: "keep",
				},
			]),
		);
		expect(insertMany).toHaveBeenCalledTimes(1);
		const [activityWrites] = insertMany.mock.calls[0] as [
			{
				userId: string;
				postId: string;
				decision: "keep" | "hide";
				source: "llm" | "cache";
			}[],
		];
		expect(activityWrites).toHaveLength(4);
		expect(activityWrites).toEqual(
			expect.arrayContaining([
				{
					userId: "user-1",
					postId: posts[0].post_id,
					decision: "hide",
					source: "cache",
				},
				{
					userId: "user-1",
					postId: posts[1].post_id,
					decision: "hide",
					source: "cache",
				},
				{
					userId: "user-1",
					postId: posts[2].post_id,
					decision: "keep",
					source: "llm",
				},
				{
					userId: "user-1",
					postId: posts[3].post_id,
					decision: "keep",
					source: "llm",
				},
			]),
		);
		expect(incrementUsageBy).toHaveBeenCalledTimes(1);
		expect(incrementUsageBy).toHaveBeenCalledWith("user-1", 2, "2026-02-01");

		const outcomesByPostId = new Map(
			outcomes.map((outcome) => [outcome.post_id, outcome]),
		);
		expect(outcomesByPostId.get(posts[0].post_id)).toEqual({
			post_id: posts[0].post_id,
			decision: "hide",
			source: "cache",
		});
		expect(outcomesByPostId.get(posts[1].post_id)).toEqual({
			post_id: posts[1].post_id,
			decision: "hide",
			source: "cache",
		});
		expect(outcomesByPostId.get(posts[2].post_id)).toEqual({
			post_id: posts[2].post_id,
			decision: "keep",
			source: "llm",
		});
		expect(outcomesByPostId.get(posts[3].post_id)).toEqual({
			post_id: posts[3].post_id,
			decision: "keep",
			source: "llm",
		});
	});
});
