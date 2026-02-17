import { describe, expect, it } from "bun:test";
import { ATTRIBUTES } from "../../lib/selectors";
import { LinkedInDiagnosticsService } from "./diagnostics";
import { SELECTORS } from "./selectors";

type DiagnosticsDocument = Pick<
	Document,
	"querySelector" | "querySelectorAll" | "documentElement"
>;

type FakeDocumentOptions = {
	feedRootFound?: boolean;
	candidates?: unknown[];
	preclassifyEnabled?: boolean;
	processingCount?: number;
	processedCount?: number;
};

function createCandidate(): HTMLElement {
	return { getAttribute: () => null } as unknown as HTMLElement;
}

function createFakeDocument(
	options: FakeDocumentOptions = {},
): DiagnosticsDocument {
	const feedRoot =
		options.feedRootFound === true
			? ({ getAttribute: () => null } as unknown as Element)
			: null;

	const queryAllMap = new Map<string, unknown[]>();
	queryAllMap.set(SELECTORS.candidatePostRoot, options.candidates ?? []);
	queryAllMap.set(
		`[${ATTRIBUTES.processing}]`,
		new Array(options.processingCount ?? 0).fill({}),
	);
	queryAllMap.set(
		`[${ATTRIBUTES.processed}]`,
		new Array(options.processedCount ?? 0).fill({}),
	);

	return {
		querySelector: (selector: string) =>
			selector === SELECTORS.feed ? feedRoot : null,
		querySelectorAll: (selector: string) => queryAllMap.get(selector) ?? [],
		documentElement: {
			hasAttribute: (name: string) =>
				name === ATTRIBUTES.preclassify && options.preclassifyEnabled === true,
		} as Element,
	};
}

function findCheck(
	snapshot: ReturnType<LinkedInDiagnosticsService["collectSnapshot"]>,
	id: string,
) {
	return snapshot.checks.find((check) => check.id === id);
}

describe("linkedin diagnostics service", () => {
	it("fails route check with LinkedIn feed action for ineligible routes", () => {
		const service = new LinkedInDiagnosticsService({
			documentRef: createFakeDocument(),
			routeKeyFromUrlFn: () => "/notifications/",
			shouldFilterRouteKeyFn: () => false,
			resolvePostSurfaceFn: () => null,
		});

		const snapshot = service.collectSnapshot(
			"https://www.linkedin.com/notifications/",
		);

		const routeCheck = findCheck(snapshot, "platform_route_eligible");
		expect(snapshot.platformId).toBe("linkedin");
		expect(snapshot.routeEligible).toBe(false);
		expect(routeCheck?.status).toBe("fail");
		expect(routeCheck?.nextAction).toContain("linkedin.com/feed");
	});

	it("reports pass for identity and markers when candidates are processable", () => {
		const candidateA = createCandidate();
		const candidateB = createCandidate();
		const service = new LinkedInDiagnosticsService({
			documentRef: createFakeDocument({
				feedRootFound: true,
				candidates: [candidateA, candidateB],
				preclassifyEnabled: true,
				processingCount: 1,
				processedCount: 2,
			}),
			routeKeyFromUrlFn: () => "/feed/",
			shouldFilterRouteKeyFn: () => true,
			resolvePostSurfaceFn: (node) =>
				node === candidateA ? ({ identity: "urn:li:1" } as never) : null,
		});

		const snapshot = service.collectSnapshot("https://www.linkedin.com/feed/");

		expect(findCheck(snapshot, "platform_feed_root_found")?.status).toBe(
			"pass",
		);
		expect(findCheck(snapshot, "platform_candidate_posts_found")?.status).toBe(
			"pass",
		);
		expect(findCheck(snapshot, "platform_identity_ready")?.status).toBe("pass");
		expect(findCheck(snapshot, "platform_preclassify_gate")?.status).toBe(
			"pass",
		);
		expect(findCheck(snapshot, "platform_marker_progress")?.status).toBe(
			"pass",
		);
	});
});
