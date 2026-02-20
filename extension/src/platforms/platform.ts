// extension/src/platforms/platform.ts
// The platform plugin interface. Each supported social network implements this contract.

import { PostData } from "../types";

export type PlatformId = "linkedin" | "x" | "reddit";

/**
 * Post surface: the content root (for extraction), render root (for hide/collapse decisions),
 * label root (for pill placement in label mode), and a stable identity string for deduplication.
 */
export type DetectionSignal = {
	id: string;
	weight: number;
	test: (element: HTMLElement) => boolean;
};

export type DetectionProfile = {
	/** Broad semantic hints observed from mutations and feed scans. */
	hintSelectors: readonly string[];
	/** Ancestor ascent depth for tree-context relocalization. */
	maxAncestorDepth: number;
	/** Minimum weighted score required to accept a candidate. */
	minScore: number;
	/** Rejection streak threshold that triggers a fallback full-feed scan. */
	fallbackRejectStreak: number;
	/** Weighted post-likeness signals. */
	signals: readonly DetectionSignal[];
	/** Resolve parser-compatible content root from the chosen candidate root. */
	resolveContentRoot: (candidateRoot: HTMLElement) => HTMLElement | null;
	/** Optional render root resolver. Defaults to candidate root. */
	resolveRenderRoot?: (
		candidateRoot: HTMLElement,
		contentRoot: HTMLElement,
	) => HTMLElement;
	/** Optional label root resolver. Defaults to render root. */
	resolveLabelRoot?: (
		candidateRoot: HTMLElement,
		contentRoot: HTMLElement,
		renderRoot: HTMLElement,
	) => HTMLElement;
};

/**
 * Platform plugin contract.
 * Each supported social network (LinkedIn, X, Reddit) must implement this interface.
 * The core runtime is parameterized by a PlatformPlugin and delegates all
 * platform-specific DOM parsing, routing, and surface resolution through it.
 */
export interface PlatformPlugin {
	/** Unique platform identifier. */
	readonly id: PlatformId;

	/** Platform-specific detection profile consumed by the shared detector engine. */
	readonly detectionProfile: DetectionProfile;

	/** Extract a route key from a URL (for route-change detection). */
	routeKeyFromUrl(url: string): string;

	/** Check if a route key is eligible for filtering. */
	shouldFilterRouteKey(routeKey: string): boolean;

	/** Find the feed container element in the current DOM. */
	findFeedRoot(): Element | null;

	/** Extract structured post data from a content root element. */
	extractPostData(element: HTMLElement): Promise<PostData | null>;

	/** Read post identity from an element (used for deduplication checks). */
	readPostIdentity(element: HTMLElement): string | null;
}
