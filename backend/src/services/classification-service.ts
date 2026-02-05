import { classifyPost } from './llm';
import { ScoringEngine } from './scoring';
import { tryConsumeQuota } from './quota';
import { hashContentText, normalizeContentText } from '../lib/hash';
import {
  findFreshPostDecision,
  findFreshPostDecisions,
  upsertPostClassification,
} from '../repositories/post-repository';
import { insertActivities, type ActivityInsert } from '../repositories/activity-repository';
import type { Decision } from '../types/classification';

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

export class QuotaExceededError extends Error {
  constructor() {
    super('quota_exceeded');
    this.name = 'QuotaExceededError';
  }
}

const scoringEngine = new ScoringEngine();

function getCacheExpiry(): Date {
  const cacheTtlDays = parseInt(process.env.POST_CACHE_TTL_DAYS || '7');
  const cacheExpiry = new Date();
  cacheExpiry.setDate(cacheExpiry.getDate() - cacheTtlDays);
  return cacheExpiry;
}

function getBatchLlmConcurrency(): number {
  return parseInt(process.env.BATCH_LLM_CONCURRENCY || '4');
}

function normalizePost(post: ClassifyInputPost) {
  const normalizedContent = normalizeContentText(post.content_text);

  return {
    ...post,
    normalizedContent,
    contentHash: hashContentText(normalizedContent),
  };
}

export async function classifySingle(userId: string, post: ClassifyInputPost): Promise<ClassificationResponse> {
  const normalized = normalizePost(post);
  const cached = await findFreshPostDecision(normalized.post_id, getCacheExpiry());

  if (cached) {
    await insertActivities([
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

  const consumed = await tryConsumeQuota(userId);
  if (!consumed.allowed) {
    throw new QuotaExceededError();
  }

  const llmResult = await classifyPost({
    post_id: normalized.post_id,
    author_id: normalized.author_id,
    author_name: normalized.author_name,
    content_text: normalized.normalizedContent,
  });

  const scored = scoringEngine.score(llmResult.scores);

  await upsertPostClassification({
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
    await insertActivities([
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

export async function classifyBatch(
  userId: string,
  posts: ClassifyInputPost[]
): Promise<BatchClassificationResponse[]> {
  const normalizedPosts = posts.map(normalizePost);
  const postIds = normalizedPosts.map((post) => post.post_id);
  const cachedByPostId = await findFreshPostDecisions(postIds, getCacheExpiry());

  const outcomes: BatchClassificationResponse[] = [];
  const activityRows: ActivityInsert[] = [];
  const misses: typeof normalizedPosts = [];

  for (const post of normalizedPosts) {
    const cached = cachedByPostId.get(post.post_id);
    if (cached) {
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
    { length: Math.min(getBatchLlmConcurrency(), queue.length) },
    async () => {
      while (queue.length > 0) {
        const next = queue.shift();
        if (!next) {
          return;
        }

        const consumed = await tryConsumeQuota(userId);
        if (!consumed.allowed) {
          outcomes.push({
            post_id: next.post_id,
            error: 'quota_exceeded',
          });
          continue;
        }

        const llmResult = await classifyPost({
          post_id: next.post_id,
          author_id: next.author_id,
          author_name: next.author_name,
          content_text: next.normalizedContent,
        });

        const scored = scoringEngine.score(llmResult.scores);

        await upsertPostClassification({
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
    }
  );

  await Promise.all(workers);
  await insertActivities(activityRows);

  return outcomes;
}
