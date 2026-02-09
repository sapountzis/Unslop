import { describe, expect, it, mock } from 'bun:test';
import type { Database } from '../db';
import { createClassificationEventRepository } from './classification-event-repository';

function createInsertDbMock() {
  const values = mock(async () => undefined);
  const insert = mock(() => ({ values }));

  return {
    db: { insert } as unknown as Database,
    spies: { insert, values },
  };
}

describe('classification event repository', () => {
  it('append writes immutable rows with full payloads', async () => {
    const { db, spies } = createInsertDbMock();
    const repository = createClassificationEventRepository({ db });

    const successInput = {
      contentFingerprint: 'fp-success',
      postId: 'post-success',
      model: 'openrouter/mock',
      attemptStatus: 'success' as const,
      requestPayload: {
        post_id: 'post-success',
        canonical_content: { text: 'hello world' },
      },
      responsePayload: {
        source: 'llm',
        decision: 'dim',
      },
    };

    const errorInput = {
      contentFingerprint: 'fp-error',
      postId: 'post-error',
      model: 'openrouter/mock',
      attemptStatus: 'error' as const,
      providerHttpStatus: 429,
      providerErrorCode: 'rate_limit',
      providerErrorType: 'provider_error',
      providerErrorMessage: 'rate limited',
      requestPayload: {
        post_id: 'post-error',
        canonical_content: { text: 'hello error' },
      },
      responsePayload: {
        source: 'error',
        provider_http_status: 429,
        provider_error_code: 'rate_limit',
      },
    };

    await repository.append(successInput);
    await repository.append(errorInput);

    expect(spies.insert).toHaveBeenCalledTimes(2);
    expect(spies.values).toHaveBeenCalledTimes(2);
    expect(spies.values).toHaveBeenNthCalledWith(1, successInput);
    expect(spies.values).toHaveBeenNthCalledWith(2, errorInput);
  });
});
