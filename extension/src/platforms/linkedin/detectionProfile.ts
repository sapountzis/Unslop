import type { DetectionProfile, DetectionSignal } from "../platform";
import { isLikelyFeedPostRoot, isLikelySduiFeedPost } from "./parser";

function hasTextContent(element: HTMLElement): boolean {
	const textNode = element.querySelector('p, [role="text"]');
	const text = textNode?.textContent?.trim() ?? "";
	if (text.length > 0) return true;
	return (element.textContent?.trim() ?? "").length > 30;
}

function hasLinkedInUrn(element: HTMLElement): boolean {
	const directUrn = element.getAttribute("data-urn");
	if (
		directUrn?.startsWith("urn:li:activity:") ||
		directUrn?.startsWith("urn:li:share:")
	) {
		return true;
	}
	return (
		element.querySelector(
			'[data-urn^="urn:li:activity:"], [data-urn^="urn:li:share:"]',
		) !== null
	);
}

function hasAggregateOrRecommendationMarkers(element: HTMLElement): boolean {
	const directUrn = element.getAttribute("data-urn");
	if (directUrn?.startsWith("urn:li:aggregate:")) {
		return true;
	}
	return element.querySelector('[data-urn^="urn:li:aggregate:"]') !== null;
}

/** Check for social action buttons via aria-label (SDUI and classic). */
function hasSocialActionButtons(element: HTMLElement): boolean {
	const buttons = element.querySelectorAll("button[aria-label]");
	let socialCount = 0;
	for (const btn of buttons) {
		const label = btn.getAttribute("aria-label") ?? "";
		if (
			/\breaction\b/i.test(label) ||
			/\blike\b/i.test(label) ||
			/\bcomment\b/i.test(label) ||
			/\brepost\b/i.test(label)
		) {
			socialCount++;
		}
		if (socialCount >= 2) return true;
	}
	return false;
}

const signals: DetectionSignal[] = [
	{
		id: "article_role",
		weight: 3,
		test: (element) => element.getAttribute("role") === "article",
	},
	{
		id: "article_semantics",
		weight: 3,
		test: (element) =>
			element.tagName === "ARTICLE" ||
			element.getAttribute("role") === "article",
	},
	{
		id: "identity_urn_direct",
		weight: 6,
		test: (element) => {
			const directUrn = element.getAttribute("data-urn");
			return (
				directUrn?.startsWith("urn:li:activity:") === true ||
				directUrn?.startsWith("urn:li:share:") === true
			);
		},
	},
	{
		id: "identity_urn_descendant",
		weight: 1,
		test: (element) => {
			const directUrn = element.getAttribute("data-urn");
			if (
				directUrn?.startsWith("urn:li:activity:") ||
				directUrn?.startsWith("urn:li:share:")
			) {
				return false; // already scored by identity_urn_direct
			}
			return hasLinkedInUrn(element);
		},
	},
	{
		id: "author_anchor",
		weight: 2,
		test: (element) =>
			element.querySelector('a[href*="/in/"], a[href*="/company/"]') !== null,
	},
	{
		id: "content_anchor",
		weight: 2,
		test: (element) => hasTextContent(element),
	},
	{
		id: "aggregate_penalty",
		weight: -8,
		test: (element) => hasAggregateOrRecommendationMarkers(element),
	},
	// SDUI-specific signals (stable ARIA attributes)
	{
		id: "sdui_social_actions",
		weight: 3,
		test: (element) => hasSocialActionButtons(element),
	},
	{
		id: "sdui_listitem_role",
		weight: 2,
		test: (element) =>
			element.getAttribute("role") === "listitem" &&
			!!element.closest('[role="list"]'),
	},
];

export const linkedinDetectionProfile: DetectionProfile = {
	hintSelectors: [
		'[role="article"]',
		'[data-urn^="urn:li:activity:"]',
		'[data-urn^="urn:li:share:"]',
		// SDUI variant: posts are listitem descendants of a role="list" feed
		'[role="list"] [role="listitem"]',
		// SDUI: post text body (stable data-testid)
		'[data-testid="expandable-text-box"]',
		// SDUI: per-post component key containing the feed type suffix
		'[componentkey*="FeedType_MAIN_FEED"]',
	],
	maxAncestorDepth: 6,
	minScore: 7,
	fallbackRejectStreak: 12,
	signals,
	resolveContentRoot(candidateRoot) {
		if (isLikelyFeedPostRoot(candidateRoot)) {
			return candidateRoot;
		}

		// SDUI path: listitem with social action buttons and author links
		if (isLikelySduiFeedPost(candidateRoot)) {
			return candidateRoot;
		}

		let current: HTMLElement | null = candidateRoot;
		for (let i = 0; i < 5 && current; i++) {
			const hasArticleRole = current.getAttribute("role") === "article";
			const hasUrn =
				current.getAttribute("data-urn")?.startsWith("urn:li:activity:") ||
				current.getAttribute("data-urn")?.startsWith("urn:li:share:");
			if (hasArticleRole || hasUrn) {
				if (isLikelyFeedPostRoot(current)) {
					return current;
				}
			}
			// SDUI path: walk up to listitem
			if (isLikelySduiFeedPost(current)) {
				return current;
			}
			current = current.parentElement;
		}

		return null;
	},
	resolveRenderRoot(_candidateRoot, contentRoot) {
		// Classic LinkedIn: scroll hotkey items
		const renderRoot = contentRoot.closest("[data-finite-scroll-hotkey-item]");
		if (
			renderRoot &&
			typeof renderRoot.getAttribute === "function" &&
			typeof renderRoot.querySelector === "function"
		) {
			return renderRoot as HTMLElement;
		}
		// SDUI: listitem role is the render root
		const listItemRoot = contentRoot.closest('[role="listitem"]');
		if (
			listItemRoot &&
			typeof listItemRoot.getAttribute === "function" &&
			typeof listItemRoot.querySelector === "function"
		) {
			return listItemRoot as HTMLElement;
		}
		return contentRoot;
	},
	resolveLabelRoot(_candidateRoot, contentRoot) {
		// Keep label mode anchored to the post/article itself so the pill does not
		// sit on the wider wrapper that also contains post controls.
		return contentRoot;
	},
};
