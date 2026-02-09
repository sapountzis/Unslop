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
    const element = new MockElement() as MockElement & HTMLElement;
    const result = await extractPostData(element);
    expect(result).toBeNull();
  });
});

describe('isLikelyFeedPostRoot', () => {
  it('rejects generic non-feed data urn containers', () => {
    const element = {
      matches: () => false,
      classList: { contains: () => false },
      querySelector: () => null,
    } as {
      matches: (selector: string) => boolean;
      classList: { contains: (token: string) => boolean };
      querySelector: (selector: string) => null;
    } & HTMLElement;
    expect(isLikelyFeedPostRoot(element)).toBe(false);
  });

  it('accepts feed article roots even when data-urn is absent on the root element', () => {
    const element = {
      matches: (selector: string) => selector === '.feed-shared-update-v2[role="article"]',
      classList: { contains: (token: string) => token === 'feed-shared-update-v2' },
      querySelector: (selector: string) => {
        if (selector.includes('[data-urn^="urn:li:activity:"]')) {
          return {
            getAttribute: (name: string) => (name === 'data-urn' ? 'urn:li:activity:123' : null),
          };
        }
        return null;
      },
    } as {
      matches: (selector: string) => boolean;
      classList: { contains: (token: string) => boolean };
      querySelector: (selector: string) => { getAttribute: (name: string) => string | null } | null;
    } & HTMLElement;

    expect(isLikelyFeedPostRoot(element)).toBe(true);
  });
});
