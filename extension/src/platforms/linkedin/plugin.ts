// LinkedIn platform plugin — wires together all LinkedIn-specific modules
import type { PlatformPlugin } from "../platform";
import { routeKeyFromUrl, shouldFilterRouteKey } from "./routeDetector";
import { extractPostData, readPostIdentity } from "./parser";
import { linkedinDetectionProfile } from "./detectionProfile";

export function findLinkedInFeedRoot(
	url: string,
	doc: Document = document,
): Element | null {
	const routeKey = routeKeyFromUrl(url);
	if (!shouldFilterRouteKey(routeKey)) {
		return null;
	}
	return doc.body;
}

export const linkedinPlugin: PlatformPlugin = {
	id: "linkedin",
	detectionProfile: linkedinDetectionProfile,
	routeKeyFromUrl,
	shouldFilterRouteKey,
	findFeedRoot(): Element | null {
		return findLinkedInFeedRoot(window.location.href);
	},
	extractPostData,
	readPostIdentity,
};
