import { describe, expect, it } from 'bun:test';
import { isLikelyFeedPostRoot } from './linkedin-parser';

describe('post root selection', () => {
  it('rejects generic data-urn non-feed nodes', () => {
    const fake = {
      matches: () => false,
      classList: { contains: () => false },
      querySelector: () => null,
    } as unknown as HTMLElement;

    expect(isLikelyFeedPostRoot(fake)).toBe(false);
  });
});
