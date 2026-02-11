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

describe('reddit parser', () => {
    describe('readPostIdentity', () => {
        it('reads t3_ id from id attribute', () => {
            const el = makeElement({
                getAttribute: (name) => name === 'id' ? 't3_abc123' : null,
            });
            expect(readPostIdentity(el)).toBe('t3_abc123');
        });

        it('reads data-fullname attribute (old reddit)', () => {
            const el = makeElement({
                getAttribute: (name) => name === 'data-fullname' ? 't3_xyz' : null,
            });
            expect(readPostIdentity(el)).toBe('t3_xyz');
        });

        it('reads permalink attribute', () => {
            const el = makeElement({
                getAttribute: (name) => name === 'permalink' ? '/r/test/comments/abc/title/' : null,
            });
            expect(readPostIdentity(el)).toBe('/r/test/comments/abc/title/');
        });

        it('falls back to comment link href', () => {
            const el = makeElement({
                getAttribute: () => null,
                querySelector: (s) => {
                    if (s.includes('/comments/')) {
                        return { getAttribute: (name: string) => name === 'href' ? '/r/test/comments/def/post_title/' : null };
                    }
                    return null;
                },
            });
            expect(readPostIdentity(el)).toBe('/r/test/comments/def/post_title/');
        });

        it('returns null when nothing matches', () => {
            const el = makeElement();
            expect(readPostIdentity(el)).toBeNull();
        });

        it('ignores non-t3_ id attributes', () => {
            const el = makeElement({
                getAttribute: (name) => name === 'id' ? 'sidebar-widget' : null,
            });
            // Should not return sidebar-widget since it doesn't start with t3_
            expect(readPostIdentity(el)).toBeNull();
        });
    });

    describe('extractPostData', () => {
        it('returns null for non-post elements', async () => {
            const el = makeElement();
            expect(await extractPostData(el)).toBeNull();
        });

        it('returns null for elements with no title and no body', async () => {
            const el = makeElement({
                matches: (s) => s.includes('shreddit-post'),
                querySelector: () => null,
                getAttribute: () => null,
            });
            expect(await extractPostData(el)).toBeNull();
        });

        it('extracts shreddit-post with title attribute', async () => {
            const el = makeElement({
                matches: (s) => s.includes('shreddit-post'),
                getAttribute: (name) => {
                    if (name === 'id') return 't3_post1';
                    if (name === 'author') return 'testuser';
                    if (name === 'post-title') return 'My Shreddit Post Title';
                    return null;
                },
                querySelector: (s) => {
                    if (s.includes('[slot="text-body"]') || s.includes('[data-testid="post-body"]')) {
                        return { textContent: 'Body text of the post.' };
                    }
                    return null;
                },
            });

            const result = await extractPostData(el);
            expect(result).not.toBeNull();
            expect(result!.post_id).toBe('t3_post1');
            expect(result!.author_id).toBe('testuser');
            expect(result!.nodes[0].kind).toBe('root');
            expect(result!.nodes[0].text).toContain('my shreddit post title');
            expect(result!.nodes[0].text).toContain('body text of the post.');
        });

        it('extracts post with title from DOM (no attribute)', async () => {
            const el = makeElement({
                matches: (s) => s.includes('shreddit-post') || s.includes('post-container'),
                getAttribute: (name) => {
                    if (name === 'id') return 't3_dom1';
                    return null;
                },
                querySelector: (s) => {
                    if (s.includes('[slot="title"]') || s.includes('h3') || s.includes('[data-testid="post-title"]')) {
                        return { textContent: 'DOM Title Here' };
                    }
                    if (s.includes('[slot="text-body"]') || s.includes('[data-testid="post-body"]')) {
                        return null;
                    }
                    if (s.includes('a[href*="/user/"]') || s.includes('[data-testid="post-author"]')) {
                        return {
                            textContent: 'u/domauthor',
                            getAttribute: (name: string) => name === 'href' ? '/user/domauthor' : null,
                        };
                    }
                    return null;
                },
            });

            const result = await extractPostData(el);
            expect(result).not.toBeNull();
            expect(result!.post_id).toBe('t3_dom1');
            expect(result!.author_id).toBe('domauthor');
            expect(result!.nodes[0].text).toBe('dom title here');
        });

        it('title-only post works (no body)', async () => {
            const el = makeElement({
                matches: (s) => s.includes('shreddit-post'),
                getAttribute: (name) => {
                    if (name === 'post-title') return 'A link post';
                    if (name === 'author') return 'linkposter';
                    if (name === 'id') return 't3_linkpost';
                    return null;
                },
                querySelector: () => null,
            });

            const result = await extractPostData(el);
            expect(result).not.toBeNull();
            expect(result!.nodes[0].text).toBe('a link post');
            expect(result!.nodes).toHaveLength(1);
        });

        it('strips u/ prefix from author text', async () => {
            const el = makeElement({
                matches: (s) => s.includes('shreddit-post'),
                getAttribute: (name) => {
                    if (name === 'post-title') return 'Test';
                    if (name === 'id') return 't3_strip';
                    return null;
                },
                querySelector: (s) => {
                    if (s.includes('a[href*="/user/"]') || s.includes('[data-testid="post-author"]')) {
                        return {
                            textContent: 'u/spez',
                            getAttribute: () => null,
                        };
                    }
                    return null;
                },
            });

            const result = await extractPostData(el);
            expect(result).not.toBeNull();
            expect(result!.author_id).toBe('spez');
        });
    });
});
