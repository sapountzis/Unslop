import type { DetectionProfile, DetectionSignal } from "../platform";
import { isLikelyFeedPostRoot } from "./parser";

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
		id: "identity_urn_anchor",
		weight: 6,
		test: (element) => hasLinkedInUrn(element),
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
];

export const linkedinDetectionProfile: DetectionProfile = {
	hintSelectors: [
		'article[role="article"]',
		'[data-urn^="urn:li:activity:"]',
		'[data-urn^="urn:li:share:"]',
	],
	maxAncestorDepth: 6,
	minScore: 7,
	fallbackRejectStreak: 12,
	signals,
	resolveContentRoot(candidateRoot) {
		if (isLikelyFeedPostRoot(candidateRoot)) {
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
			current = current.parentElement;
		}

		return null;
	},
	resolveRenderRoot(_candidateRoot, contentRoot) {
		const renderRoot = contentRoot.closest("[data-finite-scroll-hotkey-item]");
		if (
			renderRoot &&
			typeof renderRoot.getAttribute === "function" &&
			typeof renderRoot.querySelector === "function"
		) {
			return renderRoot as HTMLElement;
		}
		return contentRoot;
	},
};
