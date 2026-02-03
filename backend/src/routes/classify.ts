// Classification endpoint
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { db } from '../db';
import { posts } from '../db/schema';
import { eq } from 'drizzle-orm';
import { classifyPost, type PostInput } from '../services/llm';
import { checkQuota, incrementUsage } from '../services/quota';
import { hashContentText, normalizeContentText } from '../lib/hash';

const classify = new Hono();

const classifySchema = z.object({
  post: z.object({
    post_id: z.string(),
    author_id: z.string(),
    author_name: z.string(),
    content_text: z.string().max(4000),
  }),
});

// Auth middleware (inline for this route)
const authMiddleware = async (c: any, next: any) => {
  const authHeader = c.req.header('Authorization');

  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const token = authHeader.substring(7);

  try {
    const { verifySessionToken } = await import('../lib/jwt');
    const payload = await verifySessionToken(token);
    c.set('user', payload);
    await next();
  } catch (err) {
    return c.json({ error: 'Invalid token' }, 401);
  }
};

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
    // Cache hit
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

  // Store result (insert or update)
  await db
    .insert(posts)
    .values({
      postId: postId,
      authorId: post.author_id,
      authorName: post.author_name,
      contentText: normalizedContent,
      contentHash: contentHash,
      decision: llmResult.decision,
      source: llmResult.source,
      model: llmResult.model,
    })
    .onConflictDoUpdate({
      target: posts.postId,
      set: {
        decision: llmResult.decision,
        source: llmResult.source,
        model: llmResult.model,
        updatedAt: new Date(),
      },
    });

  // Increment usage only on successful LLM calls (not errors or cache)
  if (llmResult.source === 'llm') {
    await incrementUsage(user.sub);
  }

  // Return result
  return c.json({
    post_id: postId,
    decision: llmResult.decision,
    source: llmResult.source,
  });
});

export { classify };
