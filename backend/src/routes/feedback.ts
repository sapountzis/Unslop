// Feedback endpoint
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { db } from '../db';
import { postFeedback, posts } from '../db/schema';
import { eq } from 'drizzle-orm';
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

  // Verify the post exists
  const postExists = await db
    .select()
    .from(posts)
    .where(eq(posts.postId, post_id))
    .limit(1);

  if (postExists.length === 0) {
    return c.json({ error: 'post_not_found' }, 404);
  }

  // Insert feedback record
  await db.insert(postFeedback).values({
    userId: user.sub,
    postId: post_id,
    renderedDecision: rendered_decision,
    userLabel: user_label,
  });

  return c.json({ status: 'ok' });
});

export { feedback };
