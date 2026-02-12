import type { Database } from '../db';
import { classificationEvents } from '../db/schema';

type JsonObject = Record<string, unknown>;

export interface AppendClassificationEventInput {
  contentFingerprint: string;
  postId: string;
  model?: string | null;
  attemptStatus: 'success' | 'error';
  providerHttpStatus?: number;
  providerErrorCode?: string;
  providerErrorType?: string;
  providerErrorMessage?: string;
  requestPayload: JsonObject;
  responsePayload: JsonObject;
}

export interface ClassificationEventRepository {
  append: (input: AppendClassificationEventInput) => Promise<void>;
}

export interface ClassificationEventRepositoryDeps {
  db: Database;
}

export function createClassificationEventRepository(
  deps: ClassificationEventRepositoryDeps,
): ClassificationEventRepository {
  const { db } = deps;

  async function append(input: AppendClassificationEventInput): Promise<void> {
    await db.insert(classificationEvents).values({
      contentFingerprint: input.contentFingerprint,
      postId: input.postId,
      model: input.model ?? null,
      attemptStatus: input.attemptStatus,
      ...(input.providerHttpStatus !== undefined
        ? { providerHttpStatus: input.providerHttpStatus }
        : {}),
      ...(input.providerErrorCode !== undefined
        ? { providerErrorCode: input.providerErrorCode }
        : {}),
      ...(input.providerErrorType !== undefined
        ? { providerErrorType: input.providerErrorType }
        : {}),
      ...(input.providerErrorMessage !== undefined
        ? { providerErrorMessage: input.providerErrorMessage }
        : {}),
      requestPayload: input.requestPayload,
      responsePayload: input.responsePayload,
    });
  }

  return {
    append,
  };
}
