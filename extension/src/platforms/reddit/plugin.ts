// Reddit platform plugin
import type { PlatformPlugin } from "../platform";
import { SELECTORS } from "./selectors";
import {
	routeKeyFromUrl,
	shouldFilterRoute,
	shouldFilterRouteKey,
} from "./route-detector";
import { resolvePostSurface } from "./surface";
import { extractPostData, readPostIdentity } from "./parser";

export const redditPlugin: PlatformPlugin = {
	id: "reddit",

	selectors: {
		feed: SELECTORS.feed,
		candidatePostRoot: SELECTORS.candidatePostRoot,
		renderPostRoot: SELECTORS.renderPostRoot,
	},

	preclassifyCssSelector: `shreddit-post:not([data-unslop-processed]), shreddit-ad-post:not([data-unslop-processed]), article[data-testid="post-container"]:not([data-unslop-processed]), .Post:not([data-unslop-processed])`,

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
