import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { enqueueBatch, __testing } from './batch-queue';
import { PostData } from '../types';

const post: PostData = {
  post_id: 'p1',
  author_id: 'a1',
  author_name: 'A',
  content_text: 'hello',
};

const originalChrome = (globalThis as any).chrome;
const originalSetTimeout = globalThis.setTimeout;
const originalWindowSetTimeout = globalThis.window?.setTimeout;

describe('batch queue resilience', () => {
  beforeEach(() => {
    (globalThis as any).chrome = {
      runtime: {
        sendMessage: async () => ({ status: 'ok' }),
      },
    };

    const fastTimeout = ((handler: TimerHandler, _timeout?: number) =>
      originalSetTimeout(handler, 1)) as typeof setTimeout;
    (globalThis as any).setTimeout = fastTimeout;
    if (globalThis.window) {
      globalThis.window.setTimeout = fastTimeout;
    }
  });

  afterEach(() => {
    (globalThis as any).chrome = originalChrome;
    (globalThis as any).setTimeout = originalSetTimeout;
    if (globalThis.window && originalWindowSetTimeout) {
      globalThis.window.setTimeout = originalWindowSetTimeout;
    }
  });

  it('resolves pending entries as fail-open when background stream does not deliver results', async () => {
    const result = await enqueueBatch(post);
    expect(result).toEqual({ decision: 'keep', source: 'error' });
    expect(__testing.pendingCount()).toBe(0);
  });
});
