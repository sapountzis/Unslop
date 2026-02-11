// X platform plugin
import type { PlatformPlugin } from '../platform';
import { SELECTORS } from './selectors';
import { routeKeyFromUrl, shouldFilterRoute, shouldFilterRouteKey } from './route-detector';
import { resolvePostSurface } from './surface';
import { extractPostData, readPostIdentity } from './parser';

export const xPlugin: PlatformPlugin = {
    id: 'x',

    selectors: {
        feed: SELECTORS.feed,
        candidatePostRoot: SELECTORS.candidatePostRoot,
        renderPostRoot: SELECTORS.renderPostRoot,
    },

    preclassifyCssSelector: `[data-testid="cellInnerDiv"]:has(article[data-testid="tweet"]):not([data-unslop-processed])`,

    shouldFilterRoute,
    routeKeyFromUrl,
    shouldFilterRouteKey,

    findFeedRoot(): Element | null {
        return document.querySelector(SELECTORS.feed);
    },

    resolvePostSurface,
    extractPostData,
    readPostIdentity,
};
