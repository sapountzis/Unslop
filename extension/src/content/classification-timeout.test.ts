import { describe, expect, it } from 'bun:test';
import { classifyPostWithTimeout } from './classification-timeout';
import { CLASSIFY_TIMEOUT_MS } from '../lib/config';

describe('classifyPostWithTimeout', () => {
  it('returns classifier result when it resolves before timeout', async () => {
    const result = await classifyPostWithTimeout(
      Promise.resolve({ decision: 'hide', source: 'llm' }),
      50
    );

    expect(result).toEqual({ decision: 'hide', source: 'llm' });
  });

  it('fails open to keep when timeout elapses first', async () => {
    const start = Date.now();
    const result = await classifyPostWithTimeout(
      new Promise(() => {}),
      20
    );

    expect(result).toEqual({ decision: 'keep', source: 'error' });
    expect(Date.now() - start).toBeGreaterThanOrEqual(15);
  });

  it('uses 2000ms classify timeout config baseline', async () => {
    expect(CLASSIFY_TIMEOUT_MS).toBe(2000);

    const result = await classifyPostWithTimeout(
      Promise.resolve({ decision: 'keep', source: 'cache' }),
      CLASSIFY_TIMEOUT_MS
    );
    expect(result).toEqual({ decision: 'keep', source: 'cache' });
  });
});
