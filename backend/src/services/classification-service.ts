import { ScoringEngine } from './scoring';
import { hashContentText, normalizeContentText } from '../lib/hash';
import type { Decision } from '../types/classification';
import type { LlmService, PostInput as LlmPostInput } from './llm';
import type { QuotaService } from './quota';
import type { PostRepository } from '../repositories/post-repository';
import type { ActivityInsert, ActivityRepository } from '../repositories/activity-repository';

export interface ClassifyInputPost {
  post_id: string;
  author_id: string;
  author_name: string;
  content_text: string;
}

export interface ClassificationResponse {
  post_id: string;
  decision: Decision;
  source: 'llm' | 'cache' | 'error';
}

export type BatchClassificationResponse =
  | ClassificationResponse
  | {
      post_id: string;
      error: 'quota_exceeded';
    };

export interface ClassificationService {
  classifySingle: (userId: string, post: ClassifyInputPost) => Promise<ClassificationResponse>;
  classifyBatch: (userId: string, posts: ClassifyInputPost[]) => Promise<BatchClassificationResponse[]>;
}

export interface ClassificationServiceDeps {
  llmService: LlmService;
  quotaService: QuotaService;
  postRepository: PostRepository;
  activityRepository: ActivityRepository;
  logger: {
    info: (message: string, meta?: Record<string, unknown>) => void;
  };
  cacheTtlDays: number;
  batchLlmConcurrency: number;
}

export class QuotaExceededError extends Error {
  constructor() {
    super('quota_exceeded');
    this.name = 'QuotaExceededError';
  }
}

function normalizePost(post: ClassifyInputPost) {
  const normalizedContent = normalizeContentText(post.content_text);

  return {
    ...post,
    normalizedContent,
    contentHash: hashContentText(normalizedContent),
  };
}

export function createClassificationService(deps: ClassificationServiceDeps): ClassificationService {
  const scoringEngine = new ScoringEngine();

  function logCacheDecision(postId: string, decision: Decision): void {
    deps.logger.info('slop_audit', {
      event: 'audit_decision',
      source: 'cache',
      post_id: postId,
      decision,
      rule: 'CACHE_HIT',
      reason: 'cache_hit',
    });
  }

  function getCacheExpiry(): Date {
    const cacheExpiry = new Date();
    cacheExpiry.setDate(cacheExpiry.getDate() - deps.cacheTtlDays);
    return cacheExpiry;
  }

  async function classifySingle(userId: string, post: ClassifyInputPost): Promise<ClassificationResponse> {
    const normalized = normalizePost(post);
    const cached = await deps.postRepository.findFreshPostDecision(normalized.post_id, getCacheExpiry());

    if (cached) {
      logCacheDecision(normalized.post_id, cached.decision);
      await deps.activityRepository.insertActivities([
        {
          userId,
          postId: normalized.post_id,
          decision: cached.decision,
          source: 'cache',
        },
      ]);

      return {
        post_id: normalized.post_id,
        decision: cached.decision,
        source: 'cache',
      };
    }

    const consumed = await deps.quotaService.tryConsumeQuota(userId);
    if (!consumed.allowed) {
      throw new QuotaExceededError();
    }

    const llmResult = await deps.llmService.classifyPost({
      post_id: normalized.post_id,
      author_id: normalized.author_id,
      author_name: normalized.author_name,
      content_text: normalized.normalizedContent,
    } satisfies LlmPostInput);

    const scored = scoringEngine.score(llmResult.scores);

    await deps.postRepository.upsertPostClassification({
      postId: normalized.post_id,
      authorId: normalized.author_id,
      authorName: normalized.author_name,
      normalizedContent: normalized.normalizedContent,
      contentHash: normalized.contentHash,
      decision: scored.decision,
      source: llmResult.source,
      model: llmResult.model,
    });

    if (llmResult.source !== 'error') {
      await deps.activityRepository.insertActivities([
        {
          userId,
          postId: normalized.post_id,
          decision: scored.decision,
          source: llmResult.source,
        },
      ]);
    }

    return {
      post_id: normalized.post_id,
      decision: scored.decision,
      source: llmResult.source,
    };
  }

  async function classifyBatch(
    userId: string,
    posts: ClassifyInputPost[],
  ): Promise<BatchClassificationResponse[]> {
    const normalizedPosts = posts.map(normalizePost);
    const postIds = normalizedPosts.map((post) => post.post_id);
    const cachedByPostId = await deps.postRepository.findFreshPostDecisions(postIds, getCacheExpiry());

    const outcomes: BatchClassificationResponse[] = [];
    const activityRows: ActivityInsert[] = [];
    const misses: typeof normalizedPosts = [];

    for (const post of normalizedPosts) {
      const cached = cachedByPostId.get(post.post_id);
      if (cached) {
        logCacheDecision(post.post_id, cached.decision);
        outcomes.push({
          post_id: post.post_id,
          decision: cached.decision,
          source: 'cache',
        });
        activityRows.push({
          userId,
          postId: post.post_id,
          decision: cached.decision,
          source: 'cache',
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

          const consumed = await deps.quotaService.tryConsumeQuota(userId);
          if (!consumed.allowed) {
            outcomes.push({
              post_id: next.post_id,
              error: 'quota_exceeded',
            });
            continue;
          }

          const llmResult = await deps.llmService.classifyPost({
            post_id: next.post_id,
            author_id: next.author_id,
            author_name: next.author_name,
            content_text: next.normalizedContent,
          });

          const scored = scoringEngine.score(llmResult.scores);

          await deps.postRepository.upsertPostClassification({
            postId: next.post_id,
            authorId: next.author_id,
            authorName: next.author_name,
            normalizedContent: next.normalizedContent,
            contentHash: next.contentHash,
            decision: scored.decision,
            source: llmResult.source,
            model: llmResult.model,
          });

          if (llmResult.source !== 'error') {
            activityRows.push({
              userId,
              postId: next.post_id,
              decision: scored.decision,
              source: llmResult.source,
            });
          }

          outcomes.push({
            post_id: next.post_id,
            decision: scored.decision,
            source: llmResult.source,
          });
        }
      },
    );

    await Promise.all(workers);
    await deps.activityRepository.insertActivities(activityRows);

    return outcomes;
  }

  return {
    classifySingle,
    classifyBatch,
  };
}
