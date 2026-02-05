// Classification endpoint
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { db } from '../db';
import { posts, userActivity } from '../db/schema';
import { eq, inArray } from 'drizzle-orm';
import { classifyPost } from '../services/llm';
import { ScoringEngine } from '../services/scoring';
import { checkQuota, getQuotaStatus, incrementUsage, incrementUsageBy } from '../services/quota';
import { hashContentText, normalizeContentText } from '../lib/hash';
import { authMiddleware } from '../middleware/auth';

const classify = new Hono();

const classifySchema = z.object({
  post: z.object({
    post_id: z.string(),
    author_id: z.string(),
    author_name: z.string(),
    content_text: z.string().max(4000),
  }),
});

const batchClassifySchema = z.object({
  posts: z
    .array(
      z.object({
        post_id: z.string(),
        author_id: z.string(),
        author_name: z.string(),
        content_text: z.string().max(4000),
      })
    )
    .min(1)
    .max(20),
});

// POST /v1/classify
classify.post('/v1/classify', authMiddleware, zValidator('json', classifySchema), async (c) => {
  const user = c.get('user');
  const { post } = c.req.valid('json');

  const postId = post.post_id;
  const normalizedContent = normalizeContentText(post.content_text);
  const contentHash = hashContentText(normalizedContent);

  // Check cache first
  const cached = await db
    .select()
    .from(posts)
    .where(eq(posts.postId, postId))
    .limit(1);

  const POST_CACHE_TTL_DAYS = parseInt(process.env.POST_CACHE_TTL_DAYS || '7');
  const cacheExpiry = new Date();
  cacheExpiry.setDate(cacheExpiry.getDate() - POST_CACHE_TTL_DAYS);

  if (cached.length > 0 && cached[0].updatedAt > cacheExpiry) {
    // Cache hit - still record activity for stats
    await db.insert(userActivity).values({
      userId: user.sub,
      postId: postId,
      decision: cached[0].decision,
      source: 'cache',
    });

    return c.json({
      post_id: postId,
      decision: cached[0].decision,
      source: 'cache',
    });
  }

  // Check quota
  const quotaCheck = await checkQuota(user.sub);

  if (!quotaCheck.allowed) {
    return c.json({ error: 'quota_exceeded' }, 429);
  }

  // Call LLM
  const llmResult = await classifyPost({
    post_id: postId,
    author_id: post.author_id,
    author_name: post.author_name,
    content_text: normalizedContent,
  });

  const engine = new ScoringEngine();
  const result = engine.score(llmResult.scores);

  // Store result (insert or update)
  await db
    .insert(posts)
    .values({
      postId: postId,
      authorId: post.author_id,
      authorName: post.author_name,
      contentText: normalizedContent,
      contentHash: contentHash,
      decision: result.decision,
      source: llmResult.source,
      model: llmResult.model,
    })
    .onConflictDoUpdate({
      target: posts.postId,
      set: {
        decision: result.decision,
        source: llmResult.source,
        model: llmResult.model,
        updatedAt: new Date(),
      },
    });

  // Increment usage only on successful LLM calls (not errors or cache)
  if (llmResult.source === 'llm') {
    await incrementUsage(user.sub);
  }

  // Record activity for stats (both llm and cache, not errors)
  if (llmResult.source !== 'error') {
    await db.insert(userActivity).values({
      userId: user.sub,
      postId: postId,
      decision: result.decision,
      source: llmResult.source,
    });
  }

  // Return result
  return c.json({
    post_id: postId,
    decision: result.decision,
    source: llmResult.source,
  });
});

// POST /v1/classify/batch
classify.post('/v1/classify/batch', authMiddleware, zValidator('json', batchClassifySchema), async (c) => {
  const user = c.get('user');
  const { posts: inputPosts } = c.req.valid('json');
  const encoder = new TextEncoder();
  const POST_CACHE_TTL_DAYS = parseInt(process.env.POST_CACHE_TTL_DAYS || '7');
  const BATCH_LLM_CONCURRENCY = parseInt(process.env.BATCH_LLM_CONCURRENCY || '4');

  const stream = new ReadableStream({
    async start(controller) {
      const writeLine = (payload: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(payload)}\n`));
      };

      const normalizedPosts = inputPosts.map((post) => {
        const normalizedContent = normalizeContentText(post.content_text);
        return {
          ...post,
          normalizedContent,
          contentHash: hashContentText(normalizedContent),
        };
      });

      const postIds = normalizedPosts.map((post) => post.post_id);
      const cachedRows = await db
        .select()
        .from(posts)
        .where(inArray(posts.postId, postIds));

      const cacheExpiry = new Date();
      cacheExpiry.setDate(cacheExpiry.getDate() - POST_CACHE_TTL_DAYS);

      const cachedMap = new Map<string, typeof cachedRows[number]>();
      for (const row of cachedRows) {
        if (row.updatedAt > cacheExpiry) {
          cachedMap.set(row.postId, row);
        }
      }

      const activityRows: Array<{
        userId: string;
        postId: string;
        decision: string;
        source: string;
      }> = [];

      for (const cached of cachedMap.values()) {
        writeLine({
          post_id: cached.postId,
          decision: cached.decision,
          source: 'cache',
        });
        activityRows.push({
          userId: user.sub,
          postId: cached.postId,
          decision: cached.decision,
          source: 'cache',
        });
      }

      const misses = normalizedPosts.filter((post) => !cachedMap.has(post.post_id));

      if (misses.length === 0) {
        if (activityRows.length > 0) {
          await db.insert(userActivity).values(activityRows);
        }
        controller.close();
        return;
      }

      const quotaStatus = await getQuotaStatus(user.sub);
      const allowedCount = Math.min(quotaStatus.remaining, misses.length);
      const allowedMisses = misses.slice(0, allowedCount);
      const overQuota = misses.slice(allowedCount);

      for (const post of overQuota) {
        writeLine({ post_id: post.post_id, error: 'quota_exceeded' });
      }

      const queue = [...allowedMisses];
      const engine = new ScoringEngine();
      let llmCallCount = 0;

      const workers = Array.from({ length: Math.min(BATCH_LLM_CONCURRENCY, queue.length) }, async () => {
        while (queue.length > 0) {
          const post = queue.shift();
          if (!post) return;

          const llmResult = await classifyPost({
            post_id: post.post_id,
            author_id: post.author_id,
            author_name: post.author_name,
            content_text: post.normalizedContent,
          });

          const scored = engine.score(llmResult.scores);

          await db
            .insert(posts)
            .values({
              postId: post.post_id,
              authorId: post.author_id,
              authorName: post.author_name,
              contentText: post.normalizedContent,
              contentHash: post.contentHash,
              decision: scored.decision,
              source: llmResult.source,
              model: llmResult.model,
            })
            .onConflictDoUpdate({
              target: posts.postId,
              set: {
                decision: scored.decision,
                source: llmResult.source,
                model: llmResult.model,
                updatedAt: new Date(),
              },
            });

          if (llmResult.source === 'llm') {
            llmCallCount += 1;
          }

          if (llmResult.source !== 'error') {
            activityRows.push({
              userId: user.sub,
              postId: post.post_id,
              decision: scored.decision,
              source: llmResult.source,
            });
          }

          writeLine({
            post_id: post.post_id,
            decision: scored.decision,
            source: llmResult.source,
          });
        }
      });

      await Promise.all(workers);

      if (activityRows.length > 0) {
        await db.insert(userActivity).values(activityRows);
      }

      if (llmCallCount > 0) {
        await incrementUsageBy(user.sub, llmCallCount, quotaStatus.periodStart);
      }

      controller.close();
    },
  });

  return c.body(stream, 200, {
    'Content-Type': 'application/x-ndjson; charset=utf-8',
    'Cache-Control': 'no-store',
  });
});

export { classify };
