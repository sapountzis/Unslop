// extension/src/platforms/platform.ts
// The platform plugin interface. Each supported social network implements this contract.

import { PostData } from "../types";
import type { DiagnosticCheck } from "../lib/diagnostics";

export type PlatformId = "linkedin" | "x" | "reddit";

/**
 * Post surface: the content root (for extraction), render root (for hide/collapse decisions),
 * label root (for pill placement in label mode), and a stable identity string for deduplication.
 */
export type PostSurface = {
	contentRoot: HTMLElement;
	renderRoot: HTMLElement;
	labelRoot: HTMLElement;
	identity: string;
};

/**
 * Platform-specific DOM selectors.
 */
export type PlatformSelectors = {
	/** The feed container selector(s). */
	feed: string;
	/** Selector matching the semantic content card used for extraction/classification. */
	candidatePostRoot: string;
	/** Selector matching the outer layout node used for keep/hide rendering. */
	renderPostRoot: string;
};

export type PlatformDiagnosticsSnapshot = {
	platformId: PlatformId;
	url: string;
	routeKey: string;
	routeEligible: boolean;
	checks: DiagnosticCheck[];
};

export type PlatformDiagnosticsProvider = {
	collectSnapshot: (url: string) => PlatformDiagnosticsSnapshot;
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

	/** Platform-specific DOM selectors. */
	readonly selectors: PlatformSelectors;

	/**
	 * CSS selector fragment used by the pre-classify gate.
	 * Applied to unprocessed post containers to hide them before classification finishes.
	 */
	readonly preclassifyCssSelector: string;

	/** Check if a URL's route should have filtering enabled. */
	shouldFilterRoute(url: string): boolean;

	/** Extract a route key from a URL (for route-change detection). */
	routeKeyFromUrl(url: string): string;

	/** Check if a route key is eligible for filtering. */
	shouldFilterRouteKey(routeKey: string): boolean;

	/** Find the feed container element in the current DOM. */
	findFeedRoot(): Element | null;

	/** Resolve a DOM node into a post surface, or null if not a valid post. */
	resolvePostSurface(node: HTMLElement): PostSurface | null;

	/** Extract structured post data from a content root element. */
	extractPostData(element: HTMLElement): Promise<PostData | null>;

	/** Read post identity from an element (used for deduplication checks). */
	readPostIdentity(element: HTMLElement): string | null;

	/** Platform-owned diagnostics collector for DOM and route checks. */
	readonly diagnostics: PlatformDiagnosticsProvider;
}
