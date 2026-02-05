// Feedback endpoint
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { db } from '../db';
import { postFeedback } from '../db/schema';
import { authMiddleware } from '../middleware/auth';

const feedback = new Hono();

const feedbackSchema = z.object({
  post_id: z.string(),
  rendered_decision: z.enum(['keep', 'dim', 'hide']),
  user_label: z.enum(['should_keep', 'should_hide']),
});

// POST /v1/feedback
feedback.post('/v1/feedback', authMiddleware, zValidator('json', feedbackSchema), async (c) => {
  const user = c.get('user');
  const { post_id, rendered_decision, user_label } = c.req.valid('json');

  try {
    await db.insert(postFeedback).values({
      userId: user.sub,
      postId: post_id,
      renderedDecision: rendered_decision,
      userLabel: user_label,
    });
  } catch (error) {
    const dbError = error as { code?: string };
    if (dbError.code === '23503') {
      return c.json({ error: 'post_not_found' }, 404);
    }
    throw error;
  }

  return c.json({ status: 'ok' });
});

export { feedback };
