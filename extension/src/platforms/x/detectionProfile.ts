import type { DetectionProfile, DetectionSignal } from "../platform";
import { isLikelyTweetRoot } from "./parser";

function hasStatusLink(element: HTMLElement): boolean {
	const link = element.querySelector('a[href*="/status/"]');
	if (!link) return false;
	const href = link.getAttribute("href");
	return Boolean(href && href.includes("/status/"));
}

const signals: DetectionSignal[] = [
	{
		id: "article_root",
		weight: 4,
		test: (element) =>
			element.tagName.toLowerCase() === "article" ||
			element.getAttribute("role") === "article",
	},
	{
		id: "status_link",
		weight: 5,
		test: (element) => hasStatusLink(element),
	},
	{
		id: "tweet_text",
		weight: 3,
		test: (element) =>
			element.querySelector('a[href*="/status/"]') !== null ||
			element.querySelector("p") !== null,
	},
	{
		id: "author_anchor",
		weight: 2,
		test: (element) => element.querySelector('a[href^="/"]') !== null,
	},
	{
		id: "conversation_penalty",
		weight: -4,
		test: (element) =>
			element
				.getAttribute("aria-label")
				?.toLowerCase()
				.includes("who to follow") ?? false,
	},
];

export const xDetectionProfile: DetectionProfile = {
	hintSelectors: ['article[role="article"]', "a[href*='/status/']"],
	maxAncestorDepth: 7,
	minScore: 7,
	fallbackRejectStreak: 12,
	signals,
	resolveContentRoot(candidateRoot) {
		// Semantic-first: accept if already a valid tweet root
		if (isLikelyTweetRoot(candidateRoot)) {
			return candidateRoot;
		}

		// Climb ancestors looking for semantic article markers (tag, role)
		let current: HTMLElement | null = candidateRoot;
		for (let i = 0; i < 5 && current; i++) {
			const tagName = (current.tagName ?? "").toLowerCase();
			const hasArticleSemantics =
				tagName === "article" || current.getAttribute("role") === "article";
			if (hasArticleSemantics) {
				if (isLikelyTweetRoot(current)) {
					return current;
				}
			}
			current = current.parentElement;
		}

		return null;
	},
	resolveRenderRoot(_candidateRoot, contentRoot) {
		// Prefer structural parent of article; data-testid fallback is brittle (temporary)
		const articleParent = contentRoot.closest("article")?.parentElement;
		if (
			articleParent &&
			typeof articleParent.getAttribute === "function" &&
			typeof articleParent.querySelector === "function"
		) {
			return articleParent as HTMLElement;
		}
		return contentRoot;
	},
	resolveLabelRoot(_candidateRoot, contentRoot) {
		return contentRoot;
	},
};
