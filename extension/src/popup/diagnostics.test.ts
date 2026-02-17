import { describe, expect, it } from "bun:test";
import type {
	BackgroundDiagnosticsSnapshot,
	ContentDiagnosticsSnapshot,
} from "../lib/diagnostics";
import { buildDiagnosticsReport } from "./diagnostics";

const BASE_BACKGROUND: BackgroundDiagnosticsSnapshot = {
	enabled: true,
	hasJwt: true,
	activeTabId: 7,
	activeTabUrl: "https://www.linkedin.com/feed/",
	activeTabHost: "www.linkedin.com",
	activeTabIsLinkedIn: true,
	activeTabIsSupportedFeedHost: true,
};

const BASE_CONTENT: ContentDiagnosticsSnapshot = {
	platformId: "linkedin",
	url: "https://www.linkedin.com/feed/",
	routeKey: "/feed/",
	routeEligible: true,
	preclassifyEnabled: true,
	feedRootFound: true,
	candidatePostCount: 6,
	identityReadyCount: 6,
	processingCount: 1,
	processedCount: 6,
	runtimeMode: "enabled_active",
	runtimeEnabledForProcessing: true,
	observerLive: true,
	pendingBatchCount: 0,
};

describe("popup diagnostics report", () => {
	it("reports service worker failure when background diagnostics are unavailable", () => {
		const report = buildDiagnosticsReport({
			backgroundSnapshot: null,
			backgroundError: "Extension context invalidated",
			contentSnapshot: null,
			contentError: null,
		});

		expect(report.summary.fail).toBe(1);
		expect(report.checks[0]?.id).toBe("service_worker_reachable");
		expect(report.checks[0]?.status).toBe("fail");
	});

	it("returns pass summary for healthy snapshots", () => {
		const report = buildDiagnosticsReport({
			backgroundSnapshot: BASE_BACKGROUND,
			backgroundError: null,
			contentSnapshot: BASE_CONTENT,
			contentError: null,
		});

		expect(report.overallStatus).toBe("pass");
		expect(report.summary.fail).toBe(0);
		expect(report.summary.warn).toBe(0);
	});

	it("flags missing content diagnostics as failure", () => {
		const report = buildDiagnosticsReport({
			backgroundSnapshot: BASE_BACKGROUND,
			backgroundError: null,
			contentSnapshot: null,
			contentError:
				"Could not establish connection. Receiving end does not exist.",
		});

		const contentPing = report.checks.find(
			(check) => check.id === "content_ping",
		);
		expect(contentPing?.status).toBe("fail");
		expect(report.overallStatus).toBe("fail");
	});

	it("fails identity extraction when posts exist but identities are missing", () => {
		const report = buildDiagnosticsReport({
			backgroundSnapshot: BASE_BACKGROUND,
			backgroundError: null,
			contentSnapshot: {
				...BASE_CONTENT,
				identityReadyCount: 0,
			},
			contentError: null,
		});

		const identityCheck = report.checks.find(
			(check) => check.id === "post_identity_ready",
		);
		expect(identityCheck?.status).toBe("fail");
		expect(report.overallStatus).toBe("fail");
	});
});
