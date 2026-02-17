// LinkedIn platform plugin — wires together all LinkedIn-specific modules
import type { PlatformPlugin } from "../platform";
import { SELECTORS } from "./selectors";
import {
	routeKeyFromUrl,
	shouldFilterRoute,
	shouldFilterRouteKey,
} from "./route-detector";
import { resolvePostSurface } from "./surface";
import { extractPostData, readPostIdentity } from "./parser";
import { linkedinDiagnostics } from "./diagnostics";

export const linkedinPlugin: PlatformPlugin = {
	id: "linkedin",

	selectors: {
		feed: SELECTORS.feed,
		candidatePostRoot: SELECTORS.candidatePostRoot,
		renderPostRoot: SELECTORS.renderPostRoot,
	},

	preclassifyCssSelector: `[data-finite-scroll-hotkey-item]:has(.feed-shared-update-v2[role="article"]):not([data-unslop-processed]):not([data-id^="urn:li:aggregate:"]):not(:has(.feed-shared-aggregated-content)):not(:has(.update-components-feed-discovery-entity))`,

	shouldFilterRoute,
	routeKeyFromUrl,
	shouldFilterRouteKey,

	findFeedRoot(): Element | null {
		return document.querySelector(SELECTORS.feed);
	},

	resolvePostSurface,
	extractPostData,
	readPostIdentity,
	diagnostics: linkedinDiagnostics,
};
