// Reddit platform plugin
import type { PlatformPlugin } from "../platform";
import { routeKeyFromUrl, shouldFilterRouteKey } from "./routeDetector";
import { extractPostData, readPostIdentity } from "./parser";
import { redditDetectionProfile } from "./detectionProfile";

export const redditPlugin: PlatformPlugin = {
	id: "reddit",
	detectionProfile: redditDetectionProfile,
	routeKeyFromUrl,
	shouldFilterRouteKey,
	findFeedRoot(): Element | null {
		return document.querySelector("shreddit-feed, main");
	},
	extractPostData,
	readPostIdentity,
};
