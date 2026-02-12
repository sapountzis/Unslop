import { describe, expect, it } from 'bun:test';
import { extractPostData, readPostIdentity, isLikelyFeedPostRoot } from './parser';

function makeElement(overrides: Partial<{
    matches: (s: string) => boolean;
    querySelector: (s: string) => any;
    querySelectorAll: (s: string) => any[];
    getAttribute: (s: string) => string | null;
    classList: { contains: (s: string) => boolean };
}> = {}): HTMLElement {
    return {
        matches: overrides.matches ?? (() => false),
        querySelector: overrides.querySelector ?? (() => null),
        querySelectorAll: overrides.querySelectorAll ?? (() => []),
        getAttribute: overrides.getAttribute ?? (() => null),
        classList: overrides.classList ?? { contains: () => false },
        closest: () => null,
    } as unknown as HTMLElement;
}

describe('linkedin parser', () => {
    describe('isLikelyFeedPostRoot', () => {
        it('rejects elements without feed-shared-update-v2 class', () => {
            const el = makeElement({
                matches: () => false,
                classList: { contains: () => false },
            });
            expect(isLikelyFeedPostRoot(el)).toBe(false);
        });

        it('rejects aggregate URNs', () => {
            const el = makeElement({
                matches: (s) => s.includes('feed-shared-update-v2'),
                classList: { contains: (c) => c === 'feed-shared-update-v2' },
                getAttribute: (name) => name === 'data-urn' ? 'urn:li:aggregate:123' : null,
            });
            expect(isLikelyFeedPostRoot(el)).toBe(false);
        });

        it('rejects elements with recommendation entities', () => {
            const el = makeElement({
                matches: (s) => s.includes('feed-shared-update-v2'),
                classList: { contains: (c) => c === 'feed-shared-update-v2' },
                getAttribute: () => null,
                querySelector: (s) => {
                    if (s.includes('feed-discovery-entity') || s.includes('aggregated-content')) {
                        return {};
                    }
                    return null;
                },
            });
            expect(isLikelyFeedPostRoot(el)).toBe(false);
        });

        it('accepts valid feed post with URN', () => {
            const el = makeElement({
                matches: (s) => s.includes('feed-shared-update-v2') || s.includes('data-urn'),
                classList: { contains: (c) => c === 'feed-shared-update-v2' },
                getAttribute: (name) => name === 'data-urn' ? 'urn:li:activity:123' : null,
                querySelector: () => null,
            });
            expect(isLikelyFeedPostRoot(el)).toBe(true);
        });
    });

    describe('readPostIdentity', () => {
        it('reads data-id attribute', () => {
            const el = makeElement({
                getAttribute: (name) => name === 'data-id' ? 'post-123' : null,
            });
            expect(readPostIdentity(el)).toBe('post-123');
        });

        it('falls back to data-urn', () => {
            const el = makeElement({
                getAttribute: (name) => name === 'data-urn' ? 'urn:li:activity:456' : null,
            });
            expect(readPostIdentity(el)).toBe('urn:li:activity:456');
        });

        it('falls back to nested URN element', () => {
            const el = makeElement({
                getAttribute: () => null,
                querySelector: () => ({
                    getAttribute: (name: string) => name === 'data-urn' ? 'urn:li:share:789' : null,
                }),
            });
            expect(readPostIdentity(el)).toBe('urn:li:share:789');
        });

        it('returns null when no identity found', () => {
            const el = makeElement();
            expect(readPostIdentity(el)).toBeNull();
        });
    });

    describe('extractPostData', () => {
        it('returns null for non-post elements', async () => {
            const el = makeElement();
            expect(await extractPostData(el)).toBeNull();
        });

        it('extracts basic post with text content', async () => {
            const el = makeElement({
                matches: (s) => s.includes('feed-shared-update-v2') || s.includes('data-urn'),
                classList: { contains: (c) => c === 'feed-shared-update-v2' },
                getAttribute: (name) => name === 'data-urn' ? 'urn:li:activity:test123' : null,
                querySelector: (s) => {
                    if (s.includes('feed-shared-text') || s.includes('feed-shared-update-v2__description')) {
                        return { textContent: '  My LinkedIn post content.  ', closest: () => null };
                    }
                    if (s.includes('a[href*="/in/"]') || s.includes('a[href*="/company/"]')) {
                        return {
                            getAttribute: (name: string) => name === 'href' ? '/in/johndoe/' : null,
                            textContent: null,
                        };
                    }
                    if (s.includes('actor__title') || s.includes('visually-hidden') || s.includes('anonymize')) {
                        return { textContent: 'John Doe' };
                    }
                    if (s.includes('data-urn')) {
                        return { getAttribute: (name: string) => name === 'data-urn' ? 'urn:li:activity:test123' : null };
                    }
                    return null;
                },
                querySelectorAll: () => [],
            });

            const result = await extractPostData(el);
            expect(result).not.toBeNull();
            expect(result!.author_id).toBe('johndoe');
            expect(result!.nodes[0].kind).toBe('root');
            expect(result!.nodes[0].text).toBe('my linkedin post content.');
        });

        it('handles company author URLs', async () => {
            const el = makeElement({
                matches: (s) => s.includes('feed-shared-update-v2') || s.includes('data-urn'),
                classList: { contains: (c) => c === 'feed-shared-update-v2' },
                getAttribute: (name) => name === 'data-urn' ? 'urn:li:activity:comp1' : null,
                querySelector: (s) => {
                    if (s.includes('feed-shared-text') || s.includes('feed-shared-update-v2__description')) {
                        return { textContent: 'Company post', closest: () => null };
                    }
                    if (s.includes('a[href*="/in/"]') || s.includes('a[href*="/company/"]')) {
                        return {
                            getAttribute: (name: string) => name === 'href' ? '/company/acme-corp/' : null,
                            textContent: null,
                        };
                    }
                    if (s.includes('data-urn')) {
                        return { getAttribute: (name: string) => name === 'data-urn' ? 'urn:li:activity:comp1' : null };
                    }
                    return null;
                },
                querySelectorAll: () => [],
            });

            const result = await extractPostData(el);
            expect(result).not.toBeNull();
            expect(result!.author_id).toBe('company-acme-corp');
        });
    });
});
