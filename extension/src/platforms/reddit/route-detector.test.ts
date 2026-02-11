import { describe, expect, it } from 'bun:test';
import { routeKeyFromUrl, shouldFilterRoute, shouldFilterRouteKey } from './route-detector';

describe('reddit route detector', () => {
    describe('routeKeyFromUrl', () => {
        it('normalizes root', () => {
            expect(routeKeyFromUrl('https://www.reddit.com/')).toBe('/');
        });

        it('normalizes subreddit', () => {
            expect(routeKeyFromUrl('https://www.reddit.com/r/programming')).toBe('/r/programming/');
        });

        it('normalizes /r/all', () => {
            expect(routeKeyFromUrl('https://www.reddit.com/r/all')).toBe('/r/all/');
        });

        it('normalizes /r/popular', () => {
            expect(routeKeyFromUrl('https://www.reddit.com/r/popular')).toBe('/r/popular/');
        });

        it('returns / for invalid URL', () => {
            expect(routeKeyFromUrl('not-a-url')).toBe('/');
        });

        it('handles old.reddit.com', () => {
            expect(routeKeyFromUrl('https://old.reddit.com/r/programming')).toBe('/r/programming/');
        });

        it('normalizes best route', () => {
            expect(routeKeyFromUrl('https://www.reddit.com/best')).toBe('/best/');
        });
    });

    describe('shouldFilterRouteKey', () => {
        it('accepts root /', () => {
            expect(shouldFilterRouteKey('/')).toBe(true);
        });

        it('accepts /r/all/', () => {
            expect(shouldFilterRouteKey('/r/all/')).toBe(true);
        });

        it('accepts /r/popular/', () => {
            expect(shouldFilterRouteKey('/r/popular/')).toBe(true);
        });

        it('accepts /best/', () => {
            expect(shouldFilterRouteKey('/best/')).toBe(true);
        });

        it('accepts /r/programming/', () => {
            expect(shouldFilterRouteKey('/r/programming/')).toBe(true);
        });

        it('rejects specific post pages', () => {
            expect(shouldFilterRouteKey('/r/programming/comments/abc123/some_post/')).toBe(false);
        });

        it('rejects user pages', () => {
            expect(shouldFilterRouteKey('/user/spez/')).toBe(false);
        });

        it('rejects settings', () => {
            expect(shouldFilterRouteKey('/settings/')).toBe(false);
        });

        it('rejects messages', () => {
            expect(shouldFilterRouteKey('/message/')).toBe(false);
        });
    });

    describe('shouldFilterRoute', () => {
        it('accepts reddit front page', () => {
            expect(shouldFilterRoute('https://www.reddit.com/')).toBe(true);
        });

        it('accepts subreddit feed', () => {
            expect(shouldFilterRoute('https://www.reddit.com/r/javascript')).toBe(true);
        });

        it('rejects comment pages', () => {
            expect(shouldFilterRoute('https://www.reddit.com/r/javascript/comments/abc/title')).toBe(false);
        });

        it('accepts old reddit', () => {
            expect(shouldFilterRoute('https://old.reddit.com/r/programming')).toBe(true);
        });
    });
});
