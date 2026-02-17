import { describe, expect, it } from "bun:test";
import type {
	ContentDiagnosticsResponse,
	RuntimeDiagnosticsResponse,
} from "../lib/diagnostics";
import { DiagnosticsClient } from "./diagnostics-client";

const RUNTIME_OK: RuntimeDiagnosticsResponse = {
	status: "ok",
	snapshot: {
		enabled: true,
		hasJwt: true,
		activeTabId: 7,
		activeTabUrl: "https://www.linkedin.com/feed/",
		activeTabHost: "www.linkedin.com",
		activeTabIsLinkedIn: true,
		activeTabIsSupportedFeedHost: true,
	},
};

const CONTENT_OK: ContentDiagnosticsResponse = {
	status: "ok",
	snapshot: {
		platformId: "linkedin",
		url: "https://www.linkedin.com/feed/",
		routeKey: "/feed/",
		routeEligible: true,
		preclassifyEnabled: true,
		feedRootFound: true,
		candidatePostCount: 4,
		identityReadyCount: 4,
		processingCount: 0,
		processedCount: 4,
		runtimeMode: "enabled_active",
		runtimeEnabledForProcessing: true,
		observerLive: true,
		pendingBatchCount: 0,
	},
};

describe("DiagnosticsClient", () => {
	it("returns healthy pass report when runtime and content snapshots are valid", async () => {
		const client = new DiagnosticsClient({
			requestRuntimeDiagnostics: async () => RUNTIME_OK,
			requestContentDiagnostics: async () => CONTENT_OK,
		});

		const report = await client.run();
		expect(report.overallStatus).toBe("pass");
		expect(report.summary.fail).toBe(0);
	});

	it("returns service worker failure when runtime diagnostics are invalid", async () => {
		const client = new DiagnosticsClient({
			requestRuntimeDiagnostics: async () => null,
		});

		const report = await client.run();
		const backgroundCheck = report.checks.find(
			(check) => check.id === "service_worker_reachable",
		);
		expect(backgroundCheck?.status).toBe("fail");
		expect(report.overallStatus).toBe("fail");
	});

	it("reports content ping failure when runtime has no active tab", async () => {
		const client = new DiagnosticsClient({
			requestRuntimeDiagnostics: async () => ({
				...RUNTIME_OK,
				snapshot: {
					...RUNTIME_OK.snapshot,
					activeTabId: null,
				},
			}),
		});

		const report = await client.run();
		const contentPing = report.checks.find(
			(check) => check.id === "content_ping",
		);
		expect(contentPing?.status).toBe("fail");
		expect(contentPing?.evidence).toContain("No active tab found");
	});
});
