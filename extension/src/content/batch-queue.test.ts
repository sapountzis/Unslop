import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { enqueueBatch, __testing, handleBatchResult } from './batch-queue';
import { PostData } from '../types';
import { BATCH_RESULT_TIMEOUT_MS } from '../lib/config';

const post: PostData = {
  post_id: 'p1',
  author_id: 'a1',
  author_name: 'A',
  content_text: 'hello',
};

type TestChrome = {
  runtime: {
    sendMessage: () => Promise<{ status: 'ok' }>;
  };
};
type TestGlobal = typeof globalThis & {
  chrome?: TestChrome;
  setTimeout: typeof globalThis.setTimeout;
};

const testGlobal = globalThis as TestGlobal;
const originalChrome = testGlobal.chrome;
const originalSetTimeout = testGlobal.setTimeout;
const originalWindowSetTimeout = globalThis.window?.setTimeout;

describe('batch queue resilience', () => {
  beforeEach(() => {
    testGlobal.chrome = {
      runtime: {
        sendMessage: async () => ({ status: 'ok' }),
      },
    };

    const fastTimeout = ((handler: TimerHandler, _timeout?: number) =>
      originalSetTimeout(handler, 1)) as typeof setTimeout;
    testGlobal.setTimeout = fastTimeout;
    if (globalThis.window) {
      globalThis.window.setTimeout = fastTimeout;
    }
  });

  afterEach(() => {
    testGlobal.chrome = originalChrome;
    testGlobal.setTimeout = originalSetTimeout;
    if (globalThis.window && originalWindowSetTimeout) {
      globalThis.window.setTimeout = originalWindowSetTimeout;
    }
  });

  it('resolves pending entries as fail-open when background stream does not deliver results', async () => {
    const result = await enqueueBatch(post);
    expect(result).toEqual({ decision: 'keep', source: 'error' });
    expect(__testing.pendingCount()).toBe(0);
  });

  it('uses queue timeout as the single classification timeout authority (2s)', () => {
    expect(BATCH_RESULT_TIMEOUT_MS).toBe(2000);
  });

  it('ignores late batch results after timeout resolution', async () => {
    const result = await enqueueBatch(post);
    expect(result).toEqual({ decision: 'keep', source: 'error' });
    expect(__testing.pendingCount()).toBe(0);

    handleBatchResult({
      post_id: post.post_id,
      decision: 'hide',
      source: 'llm',
    });

    expect(__testing.pendingCount()).toBe(0);
  });
});
