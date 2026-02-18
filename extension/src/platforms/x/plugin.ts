// X platform plugin
import type { PlatformPlugin } from "../platform";
import { routeKeyFromUrl, shouldFilterRouteKey } from "./routeDetector";
import { extractPostData, readPostIdentity } from "./parser";
import { xDetectionProfile } from "./detectionProfile";

export const xPlugin: PlatformPlugin = {
	id: "x",
	detectionProfile: xDetectionProfile,
	routeKeyFromUrl,
	shouldFilterRouteKey,
	findFeedRoot(): Element | null {
		return document.querySelector("main");
	},
	extractPostData,
	readPostIdentity,
};
