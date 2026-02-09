import { describe, expect, it } from 'bun:test';
import { extractPostData, isLikelyFeedPostRoot } from './linkedin-parser';
import { SELECTORS } from '../lib/selectors';

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

  it('builds deterministic node IDs with root first and nested reposts in DOM order', async () => {
    const repostNodes = [
      { textContent: 'First repost text in DOM' },
      { textContent: 'Second repost text in DOM' },
    ];

    const element = {
      matches: (selector: string) => selector === SELECTORS.candidatePostRoot,
      classList: { contains: (token: string) => token === 'feed-shared-update-v2' },
      getAttribute: (_name: string) => null,
      querySelector: (selector: string) => {
        if (selector === SELECTORS.recommendationEntity) return null;
        if (selector === SELECTORS.postUrn) return null;
        if (selector === SELECTORS.authorLink) return { getAttribute: (name: string) => (name === 'href' ? '/in/example/' : null) };
        if (selector === SELECTORS.authorName) return { textContent: 'Example User' };
        if (selector === SELECTORS.postContent) return { textContent: 'Root post text' };
        return null;
      },
      querySelectorAll: (selector: string) => {
        if (selector.includes('update-components-mini-update-v2__link-to-details-page')) {
          return repostNodes;
        }
        if (selector === SELECTORS.postContent) {
          return [{ textContent: 'Root post text' }];
        }
        return [];
      },
    } as unknown as HTMLElement;

    const result = await extractPostData(element);
    expect(result).not.toBeNull();
    expect(result?.nodes.map((node) => node.id)).toEqual(['root', 'repost-0', 'repost-1']);
    expect(result?.nodes.map((node) => node.parent_id)).toEqual([null, 'root', 'root']);
    expect(result?.nodes.map((node) => node.text)).toEqual([
      'root post text',
      'first repost text in dom',
      'second repost text in dom',
    ]);
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
      getAttribute: (_name: string) => null,
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
      getAttribute: (name: string) => string | null;
      querySelector: (selector: string) => { getAttribute: (name: string) => string | null } | null;
    } & HTMLElement;

    expect(isLikelyFeedPostRoot(element)).toBe(true);
  });

  it('rejects recommended discovery entity cards', () => {
    const element = {
      matches: (selector: string) => selector === SELECTORS.candidatePostRoot,
      classList: { contains: (token: string) => token === 'feed-shared-update-v2' },
      querySelector: (selector: string) => {
        if (selector === SELECTORS.postUrn) return null;
        if (selector === SELECTORS.postContent) return { textContent: 'People to follow based on your activity' };
        if (selector === SELECTORS.recommendationEntity) return {};
        return null;
      },
      getAttribute: (_name: string) => null,
    } as {
      matches: (selector: string) => boolean;
      classList: { contains: (token: string) => boolean };
      querySelector: (selector: string) => { textContent?: string } | null;
      getAttribute: (name: string) => string | null;
    } & HTMLElement;

    expect(isLikelyFeedPostRoot(element)).toBe(false);
  });
});
