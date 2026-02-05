import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth';
import {
  classifyBatch,
  classifySingle,
  QuotaExceededError,
} from '../services/classification-service';

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

classify.post('/v1/classify', authMiddleware, zValidator('json', classifySchema), async (c) => {
  const user = c.get('user');
  const { post } = c.req.valid('json');

  try {
    const result = await classifySingle(user.sub, post);
    return c.json(result);
  } catch (error) {
    if (error instanceof QuotaExceededError) {
      return c.json({ error: 'quota_exceeded' }, 429);
    }
    throw error;
  }
});

classify.post('/v1/classify/batch', authMiddleware, zValidator('json', batchClassifySchema), async (c) => {
  const user = c.get('user');
  const { posts } = c.req.valid('json');
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const outcomes = await classifyBatch(user.sub, posts);

      for (const outcome of outcomes) {
        controller.enqueue(encoder.encode(`${JSON.stringify(outcome)}\n`));
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
