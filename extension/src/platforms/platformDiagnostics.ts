// Content-side diagnostics — collects a high-trust snapshot from the live DOM.
//
// Green means posts are actually being processed and classified.
// These are the only two checks that prove end-to-end pipeline health.

import { ATTRIBUTES } from "../lib/selectors";
import type { ContentDiagnosticsSnapshot } from "../lib/diagnostics";
import type { PlatformId } from "./platform";

function countByAttr(
	docRef: Pick<Document, "querySelectorAll">,
	attr: string,
	value?: string,
): number {
	const selector = value ? `[${attr}="${value}"]` : `[${attr}]`;
	return docRef.querySelectorAll(selector).length;
}

export function collectContentDiagnostics(
	platformId: PlatformId,
	url: string,
	routeKey: string,
	routeEligible: boolean,
	docRef: Pick<Document, "querySelectorAll"> = document,
): ContentDiagnosticsSnapshot {
	const processed = countByAttr(docRef, ATTRIBUTES.processed);
	const hidden = countByAttr(docRef, ATTRIBUTES.decision, "hide");

	return {
		platformId,
		url,
		routeKey,
		routeEligible,
		checks: [
			{
				id: "posts_processed",
				scope: "platform",
				label: "Posts processed end-to-end",
				status: processed > 0 ? "pass" : routeEligible ? "warn" : "fail",
				evidence: `processed=${processed}`,
				nextAction:
					processed > 0
						? "None."
						: "Scroll the feed to trigger post detection, then rerun diagnostics.",
			},
			{
				id: "posts_classified",
				scope: "platform",
				label: "Classification decisions applied to DOM",
				status: processed > 0 ? "pass" : "warn",
				evidence: `hidden=${hidden}, kept=${processed - hidden}`,
				nextAction:
					processed > 0 ? "None." : "Ensure posts are processed first.",
			},
		],
	};
}
