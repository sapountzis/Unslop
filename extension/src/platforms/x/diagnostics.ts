import { ATTRIBUTES } from "../../lib/selectors";
import type { DiagnosticCheck } from "../../lib/diagnostics";
import type {
	PlatformDiagnosticsProvider,
	PlatformDiagnosticsSnapshot,
} from "../platform";
import { SELECTORS } from "./selectors";
import { resolvePostSurface } from "./surface";
import {
	routeKeyFromUrl as defaultRouteKeyFromUrl,
	shouldFilterRouteKey as defaultShouldFilterRouteKey,
} from "./route-detector";

const OPEN_X_FEED_ACTION = "Open https://x.com/home and rerun diagnostics.";

type DiagnosticsDocument = Pick<
	Document,
	"querySelector" | "querySelectorAll" | "documentElement"
>;

type XDiagnosticsDependencies = {
	documentRef?: DiagnosticsDocument;
	resolvePostSurfaceFn?: typeof resolvePostSurface;
	routeKeyFromUrlFn?: typeof defaultRouteKeyFromUrl;
	shouldFilterRouteKeyFn?: typeof defaultShouldFilterRouteKey;
};

function createPlatformCheck(
	check: Omit<DiagnosticCheck, "scope">,
): DiagnosticCheck {
	return {
		...check,
		scope: "platform",
	};
}

function isElementLike(node: unknown): node is HTMLElement {
	return (
		typeof node === "object" &&
		node !== null &&
		typeof (node as HTMLElement).getAttribute === "function"
	);
}

function countMatchingNodes(
	documentRef: DiagnosticsDocument,
	selector: string,
): number {
	let count = 0;
	for (const _node of documentRef.querySelectorAll(
		selector,
	) as Iterable<unknown>) {
		count += 1;
	}
	return count;
}

function resolveDocumentRef(
	documentRef: DiagnosticsDocument | null,
): DiagnosticsDocument {
	if (documentRef) return documentRef;
	const globalDocument = (globalThis as { document?: Document }).document;
	if (!globalDocument) {
		throw new Error("Diagnostics document is not available.");
	}
	return globalDocument;
}

export class XDiagnosticsService implements PlatformDiagnosticsProvider {
	private readonly documentRef: DiagnosticsDocument | null;
	private readonly resolvePostSurfaceFn: typeof resolvePostSurface;
	private readonly routeKeyFromUrlFn: typeof defaultRouteKeyFromUrl;
	private readonly shouldFilterRouteKeyFn: typeof defaultShouldFilterRouteKey;

	constructor(dependencies: XDiagnosticsDependencies = {}) {
		this.documentRef = dependencies.documentRef ?? null;
		this.resolvePostSurfaceFn =
			dependencies.resolvePostSurfaceFn ?? resolvePostSurface;
		this.routeKeyFromUrlFn =
			dependencies.routeKeyFromUrlFn ?? defaultRouteKeyFromUrl;
		this.shouldFilterRouteKeyFn =
			dependencies.shouldFilterRouteKeyFn ?? defaultShouldFilterRouteKey;
	}

	collectSnapshot(url: string): PlatformDiagnosticsSnapshot {
		const documentRef = resolveDocumentRef(this.documentRef);
		const routeKey = this.routeKeyFromUrlFn(url);
		const routeEligible = this.shouldFilterRouteKeyFn(routeKey);
		const feedRootFound = documentRef.querySelector(SELECTORS.feed) !== null;

		let candidatePostCount = 0;
		let identityReadyCount = 0;
		for (const candidate of documentRef.querySelectorAll(
			SELECTORS.candidatePostRoot,
		) as Iterable<unknown>) {
			if (!isElementLike(candidate)) continue;
			candidatePostCount += 1;
			if (this.resolvePostSurfaceFn(candidate)) {
				identityReadyCount += 1;
			}
		}

		const preclassifyEnabled = documentRef.documentElement.hasAttribute(
			ATTRIBUTES.preclassify,
		);
		const processingCount = countMatchingNodes(
			documentRef,
			`[${ATTRIBUTES.processing}]`,
		);
		const processedCount = countMatchingNodes(
			documentRef,
			`[${ATTRIBUTES.processed}]`,
		);
		const markerProgressCount = processingCount + processedCount;

		const checks: DiagnosticCheck[] = [
			createPlatformCheck({
				id: "platform_route_eligible",
				label: "Feed route is eligible",
				status: routeEligible ? "pass" : "fail",
				evidence: `route=${routeKey}`,
				nextAction: routeEligible ? "None." : OPEN_X_FEED_ACTION,
			}),
			createPlatformCheck({
				id: "platform_feed_root_found",
				label: "Feed root selector resolves",
				status: feedRootFound ? "pass" : "fail",
				evidence: `feed_root_found=${String(feedRootFound)}`,
				nextAction: feedRootFound
					? "None."
					: "Wait for the feed to load, then rerun diagnostics.",
			}),
			createPlatformCheck({
				id: "platform_candidate_posts_found",
				label: "Candidate posts detected",
				status: candidatePostCount > 0 ? "pass" : "warn",
				evidence: `candidate_posts=${candidatePostCount}`,
				nextAction:
					candidatePostCount > 0
						? "None."
						: "Scroll the feed once and rerun diagnostics.",
			}),
			createPlatformCheck({
				id: "platform_identity_ready",
				label: "Identity extraction from candidates",
				status:
					candidatePostCount === 0
						? "warn"
						: identityReadyCount > 0
							? "pass"
							: "fail",
				evidence: `identity_ready=${identityReadyCount}/${candidatePostCount}`,
				nextAction:
					candidatePostCount === 0
						? "Run diagnostics after posts become visible."
						: identityReadyCount > 0
							? "None."
							: "Platform DOM changed. Verify selectors and surface resolver.",
			}),
			createPlatformCheck({
				id: "platform_preclassify_gate",
				label: "Preclassify gate is attached",
				status: preclassifyEnabled ? "pass" : "warn",
				evidence: `preclassify=${String(preclassifyEnabled)}`,
				nextAction: preclassifyEnabled
					? "None."
					: "Enable filtering on a supported feed route.",
			}),
			createPlatformCheck({
				id: "platform_marker_progress",
				label: "Processing markers show progress",
				status: markerProgressCount > 0 ? "pass" : "warn",
				evidence: `processed=${processedCount}, checking=${processingCount}`,
				nextAction:
					markerProgressCount > 0
						? "None."
						: "Scroll the feed and rerun diagnostics.",
			}),
		];

		return {
			platformId: "x",
			url,
			routeKey,
			routeEligible,
			checks,
		};
	}
}

export const xDiagnostics: PlatformDiagnosticsProvider =
	new XDiagnosticsService();
