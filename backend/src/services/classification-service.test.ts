import { describe, expect, it, mock } from 'bun:test';
import { computeContentFingerprint } from '../lib/content-fingerprint';
import type {
  ClassificationCacheRepository,
  ClassificationCacheRow,
} from '../repositories/classification-cache-repository';
import type { ClassificationEventRepository } from '../repositories/classification-event-repository';
import type { ActivityRepository } from '../repositories/activity-repository';
import type { QuotaService } from './quota';
import type { LlmService } from './llm';
import type { ScoreResult } from '../types/classification';
import { createClassificationService } from './classification-service';

process.env.TEST_MODE = process.env.TEST_MODE || 'true';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/unslop_test';
process.env.APP_URL = process.env.APP_URL || 'http://localhost:3000';
process.env.MAGIC_LINK_BASE_URL = process.env.MAGIC_LINK_BASE_URL || 'http://localhost:3000';
process.env.VLM_MODEL = process.env.VLM_MODEL || 'test-vlm';

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
  post_id: 'post-1',
  author_id: 'author-1',
  author_name: 'Author One',
  nodes: [
    { id: 'root', parent_id: null, kind: 'root' as const, text: 'Hello world' },
    { id: 'node-2', parent_id: 'root', kind: 'repost' as const, text: 'Follow up' },
  ],
  attachments: [],
};

const postTwo = {
  post_id: 'post-2',
  author_id: 'author-2',
  author_name: 'Author Two',
  nodes: [
    { id: 'root', parent_id: null, kind: 'root' as const, text: 'Second post' },
  ],
  attachments: [],
};

const postThree = {
  post_id: 'post-3',
  author_id: 'author-3',
  author_name: 'Author Three',
  nodes: [
    { id: 'root', parent_id: null, kind: 'root' as const, text: 'Third post' },
  ],
  attachments: [],
};

function createQuotaService(overrides: Partial<QuotaService> = {}): QuotaService {
  return {
    getQuotaStatus: mock(async () => ({
      allowed: true,
      currentUsage: 0,
      limit: 300,
      plan: 'free',
      remaining: 300,
      periodStart: '2026-02-01',
      isPro: false,
    })),
    checkQuota: mock(async () => ({
      allowed: true,
      currentUsage: 0,
      limit: 300,
      plan: 'free',
    })),
    tryConsumeQuota: mock(async () => ({
      allowed: true,
      remaining: 100,
      periodStart: '2026-02-01',
    })),
    incrementUsageBy: mock(async () => undefined),
    incrementUsage: mock(async () => undefined),
    ...overrides,
  };
}

function createActivityRepository(overrides: Partial<ActivityRepository> = {}): ActivityRepository {
  return {
    insertActivity: mock(async () => undefined),
    insertActivities: mock(async () => undefined),
    ...overrides,
  };
}

function createCacheRepository(overrides: Partial<ClassificationCacheRepository> = {}): ClassificationCacheRepository {
  return {
    findFreshByFingerprint: mock(async () => null),
    findFreshByFingerprints: mock(async () => new Map()),
    upsertSuccess: mock(async () => undefined),
    ...overrides,
  };
}

function createEventRepository(overrides: Partial<ClassificationEventRepository> = {}): ClassificationEventRepository {
  return {
    append: mock(async () => undefined),
    ...overrides,
  };
}

function createLlmService(overrides: Partial<LlmService> = {}): LlmService {
  return {
    classifyPost: mock(async () => ({
      scores: fullScores,
      source: 'llm' as const,
      model: 'openrouter/mock',
      latency: 1,
    })),
    ...overrides,
  };
}

describe('classification service policy', () => {
  it('cache hit skips quota and event write but records cache activity', async () => {
    let observedCutoffMs: number | null = null;
    const findFreshByFingerprint = mock(async (_fingerprint: string, freshnessCutoff: Date) => {
      observedCutoffMs = freshnessCutoff.getTime();
      return {
        contentFingerprint: 'fp-cache',
        postId: post.post_id,
        authorId: post.author_id,
        authorName: post.author_name,
        canonicalContent: { post_id: post.post_id },
        decision: 'hide' as const,
        source: 'llm' as const,
        model: 'openrouter/mock',
        scoresJson: { u: 0.1 },
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    });
    const tryConsumeQuota = mock(async () => ({ allowed: true, remaining: 100, periodStart: '2026-02-01' }));
    const append = mock(async () => undefined);
    const insertActivity = mock(async () => undefined);
    const classifyPost = mock(async () => ({ scores: fullScores, source: 'llm' as const, model: 'vlm', latency: 1 }));

    const service = createClassificationService({
      llmService: createLlmService({ classifyPost }),
      quotaService: createQuotaService({ tryConsumeQuota }),
      classificationCacheRepository: createCacheRepository({ findFreshByFingerprint }),
      classificationEventRepository: createEventRepository({ append }),
      activityRepository: createActivityRepository({ insertActivity }),
      logger: { info: mock(() => undefined) },
      batchLlmConcurrency: 2,
    });

    const outcome = await service.classifySingle('user-1', post);

    expect(findFreshByFingerprint).toHaveBeenCalledWith(computeContentFingerprint(post), expect.any(Date));
    expect(observedCutoffMs).not.toBeNull();
    if (observedCutoffMs === null) {
      throw new Error('expected cache freshness cutoff');
    }
    const ageDays = (Date.now() - observedCutoffMs) / (1000 * 60 * 60 * 24);
    expect(ageDays).toBeGreaterThan(29);
    expect(ageDays).toBeLessThan(31);

    expect(outcome).toEqual({
      post_id: post.post_id,
      decision: 'hide',
      source: 'cache',
    });

    expect(tryConsumeQuota).not.toHaveBeenCalled();
    expect(classifyPost).not.toHaveBeenCalled();
    expect(append).not.toHaveBeenCalled();
    expect(insertActivity).toHaveBeenCalledWith({
      userId: 'user-1',
      postId: post.post_id,
      decision: 'hide',
      source: 'cache',
    });
  });

  it('cache miss + llm success consumes quota, writes cache, event, and llm activity', async () => {
    const tryConsumeQuota = mock(async () => ({ allowed: true, remaining: 99, periodStart: '2026-02-01' }));
    const upsertSuccess = mock(async () => undefined);
    const append = mock(async () => undefined);
    const insertActivity = mock(async () => undefined);
    const classifyPost = mock(async () => ({
      scores: fullScores,
      source: 'llm' as const,
      model: 'openrouter/mock',
      latency: 7,
    }));

    const service = createClassificationService({
      llmService: createLlmService({
        classifyPost,
      }),
      quotaService: createQuotaService({ tryConsumeQuota }),
      classificationCacheRepository: createCacheRepository({ upsertSuccess }),
      classificationEventRepository: createEventRepository({ append }),
      activityRepository: createActivityRepository({ insertActivity }),
      logger: { info: mock(() => undefined) },
      batchLlmConcurrency: 2,
    });

    const outcome = await service.classifySingle('user-1', post);

    expect(outcome).toEqual({
      post_id: post.post_id,
      decision: 'keep',
      source: 'llm',
    });
    expect(tryConsumeQuota).toHaveBeenCalledTimes(1);
    expect(classifyPost).toHaveBeenCalledWith(
      expect.objectContaining({
        post_id: post.post_id,
        nodes: post.nodes,
        attachments: post.attachments,
      }),
    );
    expect(upsertSuccess).toHaveBeenCalledTimes(1);
    expect(append).toHaveBeenCalledWith(
      expect.objectContaining({
        contentFingerprint: computeContentFingerprint(post),
        postId: post.post_id,
        attemptStatus: 'success',
      }),
    );
    expect(insertActivity).toHaveBeenCalledWith({
      userId: 'user-1',
      postId: post.post_id,
      decision: 'keep',
      source: 'llm',
    });
  });

  it('cache miss + llm error writes event with provider metadata and no cache/activity write', async () => {
    const upsertSuccess = mock(async () => undefined);
    const append = mock(async () => undefined);
    const insertActivity = mock(async () => undefined);

    const service = createClassificationService({
      llmService: createLlmService({
        classifyPost: mock(
          async () => ({
            scores: null,
            source: 'error' as const,
            model: 'openrouter/mock',
            latency: 3,
            provider_http_status: 429,
            provider_error_code: 'rate_limit',
            provider_error_type: 'provider_error',
            provider_error_message: 'rate limited',
          }),
        ),
      }),
      quotaService: createQuotaService(),
      classificationCacheRepository: createCacheRepository({ upsertSuccess }),
      classificationEventRepository: createEventRepository({ append }),
      activityRepository: createActivityRepository({ insertActivity }),
      logger: { info: mock(() => undefined) },
      batchLlmConcurrency: 2,
    });

    const outcome = await service.classifySingle('user-1', post);

    expect(outcome).toEqual({
      post_id: post.post_id,
      decision: 'keep',
      source: 'error',
    });
    expect(upsertSuccess).not.toHaveBeenCalled();
    expect(insertActivity).not.toHaveBeenCalled();
    expect(append).toHaveBeenCalledWith(
      expect.objectContaining({
        postId: post.post_id,
        attemptStatus: 'error',
        providerHttpStatus: 429,
        providerErrorCode: 'rate_limit',
        providerErrorType: 'provider_error',
        providerErrorMessage: 'rate limited',
      }),
    );
  });

  it('cache miss + fallback error always writes providerErrorMessage metadata', async () => {
    const append = mock(async () => undefined);

    const service = createClassificationService({
      llmService: createLlmService({
        classifyPost: mock(
          async () => ({
            scores: null,
            source: 'error' as const,
            model: 'dev-fallback',
            latency: 0,
          }),
        ),
      }),
      quotaService: createQuotaService(),
      classificationCacheRepository: createCacheRepository(),
      classificationEventRepository: createEventRepository({ append }),
      activityRepository: createActivityRepository(),
      logger: { info: mock(() => undefined) },
      batchLlmConcurrency: 2,
    });

    await service.classifySingle('user-1', post);

    expect(append).toHaveBeenCalledWith(
      expect.objectContaining({
        postId: post.post_id,
        attemptStatus: 'error',
        providerErrorMessage: 'llm_error:dev-fallback',
      }),
    );
  });

  it('batch writes events only for LLM attempts and activity only for non-error outcomes', async () => {
    const findFreshByFingerprint = mock(async () => null);
    const findFreshByFingerprints = mock(async (fingerprints: string[]) => {
      const hits = new Map<string, ClassificationCacheRow>();
      const postFingerprint = computeContentFingerprint(post);

      if (fingerprints.includes(postFingerprint)) {
        hits.set(postFingerprint, {
          contentFingerprint: postFingerprint,
          postId: post.post_id,
          authorId: post.author_id,
          authorName: post.author_name,
          canonicalContent: { post_id: post.post_id },
          decision: 'hide' as const,
          source: 'llm' as const,
          model: 'openrouter/mock',
          scoresJson: { eb: 0.8 },
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }

      return hits;
    });

    const tryConsumeQuota = mock(async () => ({ allowed: true, remaining: 100, periodStart: '2026-02-01' }));
    tryConsumeQuota.mockResolvedValueOnce({ allowed: true, remaining: 99, periodStart: '2026-02-01' });
    tryConsumeQuota.mockResolvedValueOnce({ allowed: true, remaining: 98, periodStart: '2026-02-01' });
    tryConsumeQuota.mockResolvedValueOnce({ allowed: false, remaining: 0, periodStart: '2026-02-01' });

    const classifyPost = mock(async (input: { post_id: string }) => {
      if (input.post_id === postTwo.post_id) {
        return {
          scores: fullScores,
          source: 'llm' as const,
          model: 'openrouter/mock',
          latency: 4,
        };
      }

      return {
        scores: null,
        source: 'error' as const,
        model: 'openrouter/mock',
        latency: 4,
        provider_http_status: 500,
      };
    });

    const append = mock(async () => undefined);
    const upsertSuccess = mock(async () => undefined);
    const insertActivities = mock(async () => undefined);

    const service = createClassificationService({
      llmService: createLlmService({ classifyPost }),
      quotaService: createQuotaService({ tryConsumeQuota }),
      classificationCacheRepository: createCacheRepository({
        findFreshByFingerprint,
        findFreshByFingerprints,
        upsertSuccess,
      }),
      classificationEventRepository: createEventRepository({ append }),
      activityRepository: createActivityRepository({ insertActivities }),
      logger: { info: mock(() => undefined) },
      batchLlmConcurrency: 2,
    });

    const outcomes = await service.classifyBatch('user-1', [post, postTwo, postThree, { ...postThree, post_id: 'post-4' }]);

    expect(tryConsumeQuota).toHaveBeenCalledTimes(3);
    expect(classifyPost).toHaveBeenCalledWith(
      expect.objectContaining({
        post_id: postTwo.post_id,
        nodes: postTwo.nodes,
        attachments: postTwo.attachments,
      }),
    );
    expect(classifyPost).toHaveBeenCalledWith(
      expect.objectContaining({
        post_id: postThree.post_id,
        nodes: postThree.nodes,
        attachments: postThree.attachments,
      }),
    );
    expect(append).toHaveBeenCalledTimes(2);
    expect(upsertSuccess).toHaveBeenCalledTimes(1);
    expect(findFreshByFingerprints).toHaveBeenCalledTimes(1);
    expect(findFreshByFingerprint).not.toHaveBeenCalled();

    expect(insertActivities).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ postId: post.post_id, source: 'cache' }),
        expect.objectContaining({ postId: postTwo.post_id, source: 'llm' }),
      ]),
    );

    const outcomeByPostId = new Map(
      outcomes.map((outcome) => [outcome.post_id, outcome]),
    );

    expect(outcomeByPostId.get(post.post_id)).toEqual({
      post_id: post.post_id,
      decision: 'hide',
      source: 'cache',
    });
    expect(outcomeByPostId.get(postTwo.post_id)).toEqual({
      post_id: postTwo.post_id,
      decision: 'keep',
      source: 'llm',
    });
    expect(outcomeByPostId.get(postThree.post_id)).toEqual({
      post_id: postThree.post_id,
      decision: 'keep',
      source: 'error',
    });
    expect(outcomeByPostId.get('post-4')).toEqual({
      post_id: 'post-4',
      error: 'quota_exceeded',
    });
  });
});
