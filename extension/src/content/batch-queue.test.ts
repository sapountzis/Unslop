import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { enqueueBatch, __testing, handleBatchResult } from './batch-queue';
import { PostData } from '../types';
import { BATCH_RESULT_TIMEOUT_MS } from '../lib/config';
import { MESSAGE_TYPES } from '../lib/messages';

const post: PostData = {
  post_id: 'p1',
  author_id: 'a1',
  author_name: 'A',
  nodes: [{ id: 'root', parent_id: null, kind: 'root', text: 'hello' }],
  attachments: [],
};

// Compile-time PostData contract checks for the multimodal payload fields.
type _PostDataNodes = PostData['nodes'];
type _PostDataAttachments = PostData['attachments'];

type TestChrome = {
  runtime: {
    sendMessage: (message: unknown) => Promise<{ status: 'ok' }>;
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
let lastMessage: unknown = null;

describe('batch queue resilience', () => {
  beforeEach(() => {
    testGlobal.chrome = {
      runtime: {
        sendMessage: async (message: unknown) => {
          lastMessage = message;
          return { status: 'ok' };
        },
      },
    };
    lastMessage = null;

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

  it('uses queue timeout as the single classification timeout authority (3s)', () => {
    expect(BATCH_RESULT_TIMEOUT_MS).toBe(3000);
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

  it('sends nodes and attachments in CLASSIFY_BATCH payload', async () => {
    const resultPromise = enqueueBatch(post);
    await new Promise<void>((resolve) => originalSetTimeout(resolve, 5));

    const payload = lastMessage as { type: string; posts: Array<Record<string, unknown>> };
    expect(payload.type).toBe(MESSAGE_TYPES.CLASSIFY_BATCH);
    expect(payload.posts[0]?.nodes).toEqual([{ id: 'root', parent_id: null, kind: 'root', text: 'hello' }]);
    expect(payload.posts[0]?.attachments).toEqual([]);

    await resultPromise;
  });
});
