import type { DetectionProfile, DetectionSignal } from "../platform";
import { isLikelyRedditPostRoot } from "./parser";

const signals: DetectionSignal[] = [
	{
		id: "shreddit_root",
		weight: 5,
		test: (element) => {
			const tag = element.tagName.toLowerCase();
			return tag === "shreddit-post" || tag === "shreddit-ad-post";
		},
	},
	{
		id: "title_anchor",
		weight: 4,
		test: (element) =>
			element.getAttribute("post-title") !== null ||
			element.querySelector(
				'[post-title], h2 a, h3 a, a[href*="/comments/"]',
			) !== null,
	},
	{
		id: "author_anchor",
		weight: 2,
		test: (element) =>
			element.getAttribute("author") !== null ||
			element.querySelector('a[href*="/user/"]') !== null,
	},
	{
		id: "permalink_anchor",
		weight: 2,
		test: (element) =>
			element.getAttribute("permalink") !== null ||
			element.querySelector('a[href*="/comments/"]') !== null,
	},
];

export const redditDetectionProfile: DetectionProfile = {
	hintSelectors: [
		"shreddit-post",
		"shreddit-ad-post",
		"[post-title]",
		'a[href*="/comments/"]',
	],
	maxAncestorDepth: 7,
	minScore: 6,
	fallbackRejectStreak: 12,
	signals,
	resolveContentRoot(candidateRoot) {
		// Semantic-first: accept if already a valid reddit post root
		if (isLikelyRedditPostRoot(candidateRoot)) {
			return candidateRoot;
		}

		// Climb ancestors looking for semantic markers (custom elements, article tag)
		let current: HTMLElement | null = candidateRoot;
		for (let i = 0; i < 5 && current; i++) {
			const tagName = (current.tagName ?? "").toLowerCase();
			if (
				tagName === "shreddit-post" ||
				tagName === "shreddit-ad-post" ||
				tagName === "article"
			) {
				if (isLikelyRedditPostRoot(current)) {
					return current;
				}
			}
			current = current.parentElement;
		}

		return null;
	},
};
