import { describe, expect, it } from 'bun:test';
import { extractPostData, readPostIdentity } from './parser';

function makeElement(overrides: Partial<{
    matches: (s: string) => boolean;
    querySelector: (s: string) => any;
    querySelectorAll: (s: string) => any[];
    getAttribute: (s: string) => string | null;
}> = {}): HTMLElement {
    return {
        matches: overrides.matches ?? (() => false),
        querySelector: overrides.querySelector ?? (() => null),
        querySelectorAll: overrides.querySelectorAll ?? (() => []),
        getAttribute: overrides.getAttribute ?? (() => null),
        closest: () => null,
    } as unknown as HTMLElement;
}

describe('x parser', () => {
    describe('readPostIdentity', () => {
        it('reads tweet link href as identity', () => {
            const el = makeElement({
                querySelector: (s) => {
                    if (s.includes('a[href*="/status/"]')) {
                        return { getAttribute: (name: string) => name === 'href' ? '/user/status/123456' : null };
                    }
                    return null;
                },
            });
            expect(readPostIdentity(el)).toBe('/user/status/123456');
        });

        it('returns null when no tweet link exists', () => {
            const el = makeElement();
            expect(readPostIdentity(el)).toBeNull();
        });

        it('ignores links without /status/ in href', () => {
            const el = makeElement({
                querySelector: (s) => {
                    if (s.includes('a[href*="/status/"]')) {
                        return null; // no status link
                    }
                    return null;
                },
            });
            expect(readPostIdentity(el)).toBeNull();
        });
    });

    describe('extractPostData', () => {
        it('returns null for non-tweet elements', async () => {
            const el = makeElement();
            expect(await extractPostData(el)).toBeNull();
        });

        it('returns null for tweet without text', async () => {
            const el = makeElement({
                matches: (s) => s.includes('[data-testid="tweet"]'),
                querySelector: (s) => {
                    if (s.includes('[data-testid="tweetText"]')) return { textContent: '' };
                    return null;
                },
            });
            expect(await extractPostData(el)).toBeNull();
        });

        it('extracts tweet data with author handle via querySelector fallback', async () => {
            const el = makeElement({
                matches: (s) => s.includes('[data-testid="tweet"]'),
                querySelector: (s) => {
                    if (s.includes('a[href*="/status/"]')) {
                        return { getAttribute: (name: string) => name === 'href' ? '/alice/status/999' : null };
                    }
                    if (s.includes('[data-testid="tweetText"]')) {
                        return { textContent: 'Test tweet content' };
                    }
                    if (s.includes('[data-testid="User-Name"]')) {
                        return {
                            // only querySelector, no querySelectorAll (tests the fallback path)
                            querySelector: (inner: string) => {
                                if (inner.includes('a[href^="/"]')) {
                                    return { getAttribute: (name: string) => name === 'href' ? '/alice' : null };
                                }
                                if (inner === 'span') {
                                    return { textContent: 'Alice' };
                                }
                                return null;
                            },
                        };
                    }
                    if (s.includes('[data-testid="quoteTweet"]')) return null;
                    return null;
                },
            });

            const result = await extractPostData(el);
            expect(result).not.toBeNull();
            expect(result!.post_id).toBe('/alice/status/999');
            expect(result!.author_id).toBe('alice');
            expect(result!.author_name).toBe('Alice');
            expect(result!.nodes[0].text).toBe('test tweet content');
            expect(result!.nodes[0].kind).toBe('root');
        });

        it('extracts quote tweet as repost node', async () => {
            const el = makeElement({
                matches: (s) => s.includes('[data-testid="tweet"]'),
                querySelector: (s) => {
                    if (s.includes('[data-testid="tweetText"]')) {
                        return { textContent: 'Main tweet' };
                    }
                    if (s.includes('[data-testid="User-Name"]')) {
                        return {
                            querySelector: (inner: string) => {
                                if (inner.includes('a[href^="/"]')) return { getAttribute: () => '/bob' };
                                if (inner === 'span') return { textContent: 'Bob' };
                                return null;
                            },
                        };
                    }
                    if (s.includes('[data-testid="quoteTweet"]')) {
                        return {
                            querySelector: (inner: string) => {
                                if (inner.includes('[data-testid="tweetText"]')) {
                                    return { textContent: 'Quoted content here' };
                                }
                                return null;
                            },
                        };
                    }
                    if (s.includes('a[href*="/status/"]')) return null;
                    return null;
                },
            });

            const result = await extractPostData(el);
            expect(result).not.toBeNull();
            expect(result!.nodes).toHaveLength(2);
            expect(result!.nodes[0].kind).toBe('root');
            expect(result!.nodes[0].text).toBe('main tweet');
            expect(result!.nodes[1].kind).toBe('repost');
            expect(result!.nodes[1].text).toBe('quoted content here');
        });

        it('returns unknown author when User-Name not found', async () => {
            const el = makeElement({
                matches: (s) => s.includes('[data-testid="tweet"]'),
                querySelector: (s) => {
                    if (s.includes('[data-testid="tweetText"]')) return { textContent: 'orphan tweet' };
                    return null;
                },
            });

            const result = await extractPostData(el);
            expect(result).not.toBeNull();
            expect(result!.author_id).toBe('unknown');
            expect(result!.author_name).toBe('Unknown');
        });
    });
});
