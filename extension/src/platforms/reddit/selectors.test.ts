import { describe, expect, it } from 'bun:test';
import { SELECTORS } from './selectors';

describe('reddit selectors', () => {
    it('defines required platform selectors', () => {
        expect(SELECTORS.feed).toBeTruthy();
        expect(SELECTORS.candidatePostRoot).toBeTruthy();
        expect(SELECTORS.renderPostRoot).toBeTruthy();
    });

    it('has post content selectors', () => {
        expect(SELECTORS.postTitle).toBeTruthy();
        expect(SELECTORS.postBody).toBeTruthy();
        expect(SELECTORS.authorName).toBeTruthy();
    });
});
