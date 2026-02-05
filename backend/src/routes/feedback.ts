import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { MiddlewareHandler } from 'hono';
import { DECISION_VALUES, FEEDBACK_LABEL_VALUES } from '../lib/domain-constants';
import type { FeedbackService } from '../services/feedback-service';

export interface FeedbackRoutesDeps {
  authMiddleware: MiddlewareHandler;
  feedbackService: FeedbackService;
}

export const feedbackSchema = z.object({
  post_id: z.string(),
  rendered_decision: z.enum(DECISION_VALUES),
  user_label: z.enum(FEEDBACK_LABEL_VALUES),
});

export function createFeedbackRoutes(deps: FeedbackRoutesDeps): Hono {
  const feedback = new Hono();

  feedback.post('/v1/feedback', deps.authMiddleware, zValidator('json', feedbackSchema), async (c) => {
    const user = c.get('user');
    const { post_id, rendered_decision, user_label } = c.req.valid('json');

    const result = await deps.feedbackService.submitFeedback({
      userId: user.sub,
      postId: post_id,
      renderedDecision: rendered_decision,
      userLabel: user_label,
    });

    if (result === 'post_not_found') {
      return c.json({ error: 'post_not_found' }, 404);
    }

    return c.json({ status: 'ok' });
  });

  return feedback;
}
