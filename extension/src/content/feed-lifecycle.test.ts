import { describe, expect, it } from 'bun:test';
import { createFeedLifecycle } from './feed-lifecycle';

describe('feed lifecycle', () => {
  it('increments generation on attach cycles', () => {
    const lifecycle = createFeedLifecycle();
    const first = lifecycle.attach('.feed-a');
    lifecycle.detach();
    const second = lifecycle.attach('.feed-b');
    expect(second).toBeGreaterThan(first);
  });

  it('marks stale generation as invalid', () => {
    const lifecycle = createFeedLifecycle();
    const first = lifecycle.attach('.feed-a');
    const second = lifecycle.attach('.feed-b');
    expect(lifecycle.isCurrent(first)).toBe(false);
    expect(lifecycle.isCurrent(second)).toBe(true);
  });
});
