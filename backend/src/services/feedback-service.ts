import { postFeedback } from '../db/schema';
import type { Database } from '../db';
import type { Decision } from '../types/classification';
import type { FeedbackLabelValue } from '../lib/domain-constants';

export interface FeedbackService {
  submitFeedback: (input: {
    userId: string;
    postId: string;
    renderedDecision: Decision;
    userLabel: FeedbackLabelValue;
  }) => Promise<'ok'>;
}

export interface FeedbackServiceDeps {
  db: Database;
}

export function createFeedbackService(deps: FeedbackServiceDeps): FeedbackService {
  async function submitFeedback(input: {
    userId: string;
    postId: string;
    renderedDecision: Decision;
    userLabel: FeedbackLabelValue;
  }): Promise<'ok'> {
    await deps.db.insert(postFeedback).values({
      userId: input.userId,
      postId: input.postId,
      renderedDecision: input.renderedDecision,
      userLabel: input.userLabel,
    });
    return 'ok';
  }

  return {
    submitFeedback,
  };
}
