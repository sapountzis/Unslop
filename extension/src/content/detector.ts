// Detector — finds post elements in the DOM using platform signals.
//
// Uses weighted signal scoring: walk up from a hint element, score each
// ancestor, pick the best match above the minimum threshold.

import type { DetectionProfile } from "../platforms/platform";
import type { DetectedSurface } from "./types";

/** Collect hint elements from a mutation node using the platform's hint selectors. */
export function collectHints(
	node: Node,
	selectors: readonly string[],
): HTMLElement[] {
	if (!(node instanceof HTMLElement)) return [];
	const hints: HTMLElement[] = [];
	for (const sel of selectors) {
		if (node.matches(sel)) hints.push(node);
		for (const el of node.querySelectorAll<HTMLElement>(sel)) {
			hints.push(el);
		}
	}
	return hints;
}

type ScoredAncestor = {
	el: HTMLElement;
	score: number;
	matchedSignals: string[];
};

function scoreAncestors(
	start: HTMLElement,
	profile: DetectionProfile,
): ScoredAncestor | null {
	let best: ScoredAncestor | null = null;
	let el: HTMLElement | null = start;
	let depth = 0;

	while (el && depth <= profile.maxAncestorDepth) {
		let score = 0;
		const matched: string[] = [];
		for (const signal of profile.signals) {
			if (signal.test(el)) {
				score += signal.weight;
				matched.push(signal.id);
			}
		}
		if (!best || score > best.score) {
			best = { el, score, matchedSignals: matched };
		}
		el = el.parentElement;
		depth++;
	}

	return best;
}

/**
 * Attempt to detect a post surface from a hint element.
 * Returns null if no candidate meets the minimum score threshold.
 */
export function detectPost(
	hint: HTMLElement,
	profile: DetectionProfile,
	readIdentity: (el: HTMLElement) => string | null,
): DetectedSurface | null {
	const best = scoreAncestors(hint, profile);
	if (!best || best.score < profile.minScore) return null;

	const contentRoot = profile.resolveContentRoot(best.el);
	if (!contentRoot) return null;

	const renderRoot = profile.resolveRenderRoot
		? profile.resolveRenderRoot(best.el, contentRoot)
		: best.el;

	const labelRoot = profile.resolveLabelRoot
		? profile.resolveLabelRoot(best.el, contentRoot, renderRoot)
		: renderRoot;

	const identity =
		readIdentity(renderRoot) ??
		readIdentity(contentRoot) ??
		readIdentity(best.el);
	if (!identity) return null;

	return { contentRoot, renderRoot, labelRoot, identity };
}

/** Scan an entire feed root for post surfaces (used on initial attach). */
export function scanFeed(
	feedRoot: Element,
	profile: DetectionProfile,
	readIdentity: (el: HTMLElement) => string | null,
): DetectedSurface[] {
	const surfaces: DetectedSurface[] = [];
	const seen = new WeakSet<HTMLElement>();

	for (const sel of profile.hintSelectors) {
		for (const hint of feedRoot.querySelectorAll<HTMLElement>(sel)) {
			const surface = detectPost(hint, profile, readIdentity);
			if (!surface) continue;
			if (seen.has(surface.renderRoot)) continue;
			seen.add(surface.renderRoot);
			surfaces.push(surface);
		}
	}

	return surfaces;
}
