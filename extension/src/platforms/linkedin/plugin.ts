// LinkedIn platform plugin — wires together all LinkedIn-specific modules
import type { PlatformPlugin } from "../platform";
import { routeKeyFromUrl, shouldFilterRouteKey } from "./routeDetector";
import { extractPostData, readPostIdentity } from "./parser";
import { linkedinDetectionProfile } from "./detectionProfile";

export const linkedinPlugin: PlatformPlugin = {
	id: "linkedin",
	detectionProfile: linkedinDetectionProfile,
	routeKeyFromUrl,
	shouldFilterRouteKey,
	findFeedRoot(): Element | null {
		return document.querySelector("main");
	},
	extractPostData,
	readPostIdentity,
};
