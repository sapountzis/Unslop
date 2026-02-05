import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { MiddlewareHandler } from 'hono';
import type { ClassificationService } from '../services/classification-service';
import { QuotaExceededError } from '../services/classification-service';
import { CLASSIFY_BATCH_MAX_SIZE, CONTENT_TEXT_MAX_CHARS } from '../lib/policy-constants';

export interface ClassifyRoutesDeps {
  authMiddleware: MiddlewareHandler;
  classificationService: ClassificationService;
}

function isQuotaExceededError(error: unknown): boolean {
  return error instanceof QuotaExceededError
    || (error instanceof Error && (error.message === 'quota_exceeded' || error.name === 'QuotaExceededError'));
}

export const classifyPostSchema = z.object({
  post_id: z.string(),
  author_id: z.string(),
  author_name: z.string(),
  content_text: z.string().max(CONTENT_TEXT_MAX_CHARS),
});

export const classifySchema = z.object({
  post: classifyPostSchema,
});

export const batchClassifySchema = z.object({
  posts: z.array(classifyPostSchema).min(1).max(CLASSIFY_BATCH_MAX_SIZE),
});

export function createClassifyRoutes(deps: ClassifyRoutesDeps): Hono {
  const classify = new Hono();

  classify.post('/v1/classify', deps.authMiddleware, zValidator('json', classifySchema), async (c) => {
    const user = c.get('user');
    const { post } = c.req.valid('json');

    try {
      const result = await deps.classificationService.classifySingle(user.sub, post);
      return c.json(result);
    } catch (error) {
      if (isQuotaExceededError(error)) {
        return c.json({ error: 'quota_exceeded' }, 429);
      }
      throw error;
    }
  });

  classify.post('/v1/classify/batch', deps.authMiddleware, zValidator('json', batchClassifySchema), async (c) => {
    const user = c.get('user');
    const { posts } = c.req.valid('json');
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        const outcomes = await deps.classificationService.classifyBatch(user.sub, posts);

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

  return classify;
}
