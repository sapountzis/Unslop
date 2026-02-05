import { and, eq, gt, inArray } from 'drizzle-orm';
import { posts } from '../db/schema';
import type { Database } from '../db';
import type { Decision } from '../types/classification';

export interface CachedPostDecision {
  postId: string;
  decision: Decision;
}

export interface UpsertPostClassificationInput {
  postId: string;
  authorId: string;
  authorName: string;
  normalizedContent: string;
  contentHash: string;
  decision: Decision;
  source: 'llm' | 'error';
  model: string;
}

export interface PostRepository {
  findFreshPostDecision: (postId: string, cacheExpiry: Date) => Promise<CachedPostDecision | null>;
  findFreshPostDecisions: (postIds: string[], cacheExpiry: Date) => Promise<Map<string, CachedPostDecision>>;
  upsertPostClassification: (input: UpsertPostClassificationInput) => Promise<void>;
}

export interface PostRepositoryDeps {
  db: Database;
}

export function createPostRepository(deps: PostRepositoryDeps): PostRepository {
  const { db } = deps;

  async function findFreshPostDecision(
    postId: string,
    cacheExpiry: Date,
  ): Promise<CachedPostDecision | null> {
    const rows = await db
      .select({
        postId: posts.postId,
        decision: posts.decision,
      })
      .from(posts)
      .where(and(eq(posts.postId, postId), gt(posts.updatedAt, cacheExpiry)))
      .limit(1);

    if (rows.length === 0) {
      return null;
    }

    return {
      postId: rows[0].postId,
      decision: rows[0].decision as Decision,
    };
  }

  async function findFreshPostDecisions(
    postIds: string[],
    cacheExpiry: Date,
  ): Promise<Map<string, CachedPostDecision>> {
    if (postIds.length === 0) {
      return new Map();
    }

    const rows = await db
      .select({
        postId: posts.postId,
        decision: posts.decision,
      })
      .from(posts)
      .where(and(inArray(posts.postId, postIds), gt(posts.updatedAt, cacheExpiry)));

    const byPostId = new Map<string, CachedPostDecision>();
    for (const row of rows) {
      byPostId.set(row.postId, {
        postId: row.postId,
        decision: row.decision as Decision,
      });
    }

    return byPostId;
  }

  async function upsertPostClassification(input: UpsertPostClassificationInput): Promise<void> {
    await db
      .insert(posts)
      .values({
        postId: input.postId,
        authorId: input.authorId,
        authorName: input.authorName,
        contentText: input.normalizedContent,
        contentHash: input.contentHash,
        decision: input.decision,
        source: input.source,
        model: input.model,
      })
      .onConflictDoUpdate({
        target: posts.postId,
        set: {
          decision: input.decision,
          source: input.source,
          model: input.model,
          updatedAt: new Date(),
        },
      });
  }

  return {
    findFreshPostDecision,
    findFreshPostDecisions,
    upsertPostClassification,
  };
}
