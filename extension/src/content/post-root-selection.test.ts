import { describe, expect, it } from 'bun:test';
import { resolvePostSurface } from './post-surface';
import { isLikelyFeedPostRoot } from './linkedin-parser';
import { SELECTORS } from '../lib/selectors';

type MockClassList = {
  contains: (token: string) => boolean;
};

type MockElement = {
  matches: (selector: string) => boolean;
  classList: MockClassList;
  querySelector: (selector: string) => MockElement | null;
  getAttribute: (name: string) => string | null;
  closest: (selector: string) => MockElement | null;
};

function createContentRoot(renderRoot: MockElement): MockElement {
  return {
    matches: (selector) => selector === SELECTORS.candidatePostRoot || selector === SELECTORS.postUrn,
    classList: {
      contains: (token) => token === 'feed-shared-update-v2',
    },
    querySelector: () => null,
    getAttribute: (name) => {
      if (name === 'data-urn') return 'urn:li:activity:123';
      return null;
    },
    closest: (selector) => {
      if (selector === SELECTORS.renderPostRoot) {
        return renderRoot;
      }
      return null;
    },
  };
}

describe('post root selection', () => {
  it('resolves outer render root while keeping inner content root for parsing', () => {
    const renderRoot = {
      matches: () => false,
      classList: { contains: () => false },
      querySelector: () => null,
      getAttribute: (name: string) => (name === 'data-id' ? 'urn:li:activity:123' : null),
      closest: () => null,
    } as MockElement;
    const contentRoot = createContentRoot(renderRoot) as MockElement & HTMLElement;

    const surface = resolvePostSurface(contentRoot);

    expect(surface).not.toBeNull();
    expect(surface?.contentRoot).toBe(contentRoot);
    expect(surface?.renderRoot).toBe(renderRoot);
    expect(surface?.identity).toBe('urn:li:activity:123');
  });

  it('rejects generic data-urn non-feed nodes', () => {
    const fake = {
      matches: () => false,
      classList: { contains: () => false },
      querySelector: () => null,
      getAttribute: () => null,
      closest: () => null,
    } as MockElement & HTMLElement;

    expect(isLikelyFeedPostRoot(fake)).toBe(false);
    expect(resolvePostSurface(fake)).toBeNull();
  });
});
