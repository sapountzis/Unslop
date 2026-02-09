import { describe, expect, it, mock } from 'bun:test';
import { createClassificationService } from './classification-service';

const post = {
  post_id: 'post-1',
  author_id: 'author-1',
  author_name: 'Author One',
  content_text: 'hello world',
};

describe('classification service cache-hit auditing', () => {
  it('logs a slop_audit entry for classifySingle cache hits', async () => {
    const logger = {
      info: mock(() => undefined),
    };

    const service = createClassificationService({
      llmService: {
        classifyPost: mock(async () => ({ scores: null, source: 'error' as const, model: 'dev', latency: 0 })),
      },
      quotaService: {
        getQuotaStatus: mock(async () => ({
          allowed: true,
          currentUsage: 0,
          limit: 300,
          plan: 'free',
          remaining: 300,
          periodStart: '2026-02-01',
          isPro: false,
        })),
        checkQuota: mock(async () => ({ allowed: true, currentUsage: 0, limit: 300, plan: 'free' })),
        tryConsumeQuota: mock(async () => ({ allowed: true, remaining: 100, periodStart: '2026-02-01' })),
        incrementUsageBy: mock(async () => undefined),
        incrementUsage: mock(async () => undefined),
      },
      postRepository: {
        findFreshPostDecision: mock(async () => ({ postId: post.post_id, decision: 'hide' as const })),
        findFreshPostDecisions: mock(async () => new Map()),
        upsertPostClassification: mock(async () => undefined),
      },
      activityRepository: {
        insertActivity: mock(async () => undefined),
        insertActivities: mock(async () => undefined),
      },
      logger,
      cacheTtlDays: 7,
      batchLlmConcurrency: 4,
    });

    const result = await service.classifySingle('user-1', post);

    expect(result).toEqual({
      post_id: post.post_id,
      decision: 'hide',
      source: 'cache',
    });
    expect(logger.info).toHaveBeenCalledWith(
      'slop_audit',
      expect.objectContaining({
        event: 'audit_decision',
        source: 'cache',
        post_id: post.post_id,
        decision: 'hide',
      }),
    );
  });

  it('logs a slop_audit entry for each classifyBatch cache hit', async () => {
    const logger = {
      info: mock(() => undefined),
    };

    const service = createClassificationService({
      llmService: {
        classifyPost: mock(async () => ({ scores: null, source: 'error' as const, model: 'dev', latency: 0 })),
      },
      quotaService: {
        getQuotaStatus: mock(async () => ({
          allowed: true,
          currentUsage: 0,
          limit: 300,
          plan: 'free',
          remaining: 300,
          periodStart: '2026-02-01',
          isPro: false,
        })),
        checkQuota: mock(async () => ({ allowed: true, currentUsage: 0, limit: 300, plan: 'free' })),
        tryConsumeQuota: mock(async () => ({ allowed: true, remaining: 100, periodStart: '2026-02-01' })),
        incrementUsageBy: mock(async () => undefined),
        incrementUsage: mock(async () => undefined),
      },
      postRepository: {
        findFreshPostDecision: mock(async () => null),
        findFreshPostDecisions: mock(async () =>
          new Map([
            ['post-1', { postId: 'post-1', decision: 'hide' as const }],
            ['post-2', { postId: 'post-2', decision: 'keep' as const }],
          ]),
        ),
        upsertPostClassification: mock(async () => undefined),
      },
      activityRepository: {
        insertActivity: mock(async () => undefined),
        insertActivities: mock(async () => undefined),
      },
      logger,
      cacheTtlDays: 7,
      batchLlmConcurrency: 4,
    });

    const outcomes = await service.classifyBatch('user-1', [
      post,
      {
        ...post,
        post_id: 'post-2',
      },
    ]);

    expect(outcomes).toEqual([
      { post_id: 'post-1', decision: 'hide', source: 'cache' },
      { post_id: 'post-2', decision: 'keep', source: 'cache' },
    ]);
    expect(logger.info).toHaveBeenCalledTimes(2);
    expect(logger.info).toHaveBeenNthCalledWith(
      1,
      'slop_audit',
      expect.objectContaining({
        event: 'audit_decision',
        source: 'cache',
        post_id: 'post-1',
        decision: 'hide',
      }),
    );
    expect(logger.info).toHaveBeenNthCalledWith(
      2,
      'slop_audit',
      expect.objectContaining({
        event: 'audit_decision',
        source: 'cache',
        post_id: 'post-2',
        decision: 'keep',
      }),
    );
  });
});
