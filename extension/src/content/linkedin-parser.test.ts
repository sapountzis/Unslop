import { describe, expect, it } from 'bun:test';
import { extractPostData, isLikelyFeedPostRoot } from './linkedin-parser';

class MockElement {
  matches(_selector: string): boolean {
    return false;
  }

  classList = {
    contains: (_token: string) => false,
  };

  hasAttribute(_name: string): boolean {
    return false;
  }

  querySelector(_selector: string): null {
    return null;
  }

  getAttribute(_name: string): null {
    return null;
  }
}

describe('extractPostData', () => {
  it('returns null for non-feed elements', async () => {
    const element = new MockElement();
    const result = await extractPostData(element as unknown as HTMLElement);
    expect(result).toBeNull();
  });
});

describe('isLikelyFeedPostRoot', () => {
  it('rejects generic non-feed data urn containers', () => {
    const element = {
      matches: () => false,
      classList: { contains: () => false },
      querySelector: () => null,
    } as unknown as HTMLElement;
    expect(isLikelyFeedPostRoot(element)).toBe(false);
  });
});
