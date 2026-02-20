import { describe, expect, it } from "bun:test";
import type {
	ContentDiagnosticsSnapshot,
	RuntimeDiagnosticsSnapshot,
} from "../lib/diagnostics";
import { buildDiagnosticsReport } from "./diagnostics";

const BASE_RUNTIME: RuntimeDiagnosticsSnapshot = {
	devModeEnabled: true,
	enabled: true,
	hasJwt: true,
	activeTabId: 7,
	activeTabUrl: "https://www.linkedin.com/feed/",
	activeTabHost: "www.linkedin.com",
	supportedPlatformId: "linkedin",
	backendReachable: true,
	backendLatencyMs: 9,
	backendHttpStatus: 200,
	backendError: null,
};

const BASE_CONTENT: ContentDiagnosticsSnapshot = {
	platformId: "linkedin",
	url: "https://www.linkedin.com/feed/",
	routeKey: "/feed/",
	routeEligible: true,
	checks: [
		{
			id: "platform_route_eligible",
			scope: "platform",
			label: "Feed route is eligible",
			status: "pass",
			evidence: "route=/feed/",
			nextAction: "None.",
		},
	],
};

describe("popup diagnostics report", () => {
	it("reports service worker failure when runtime diagnostics are unavailable", () => {
		const report = buildDiagnosticsReport({
			runtimeSnapshot: null,
			runtimeDisabledReason: null,
			runtimeError: "Extension context invalidated",
			contentSnapshot: null,
			contentDisabledReason: null,
			contentError: null,
		});

		expect(report.summary.fail).toBe(1);
		expect(report.checks[0]?.id).toBe("service_worker_reachable");
		expect(report.checks[0]?.status).toBe("fail");
	});

	it("returns pass summary for healthy snapshots", () => {
		const report = buildDiagnosticsReport({
			runtimeSnapshot: BASE_RUNTIME,
			runtimeDisabledReason: null,
			runtimeError: null,
			contentSnapshot: BASE_CONTENT,
			contentDisabledReason: null,
			contentError: null,
		});

		expect(report.overallStatus).toBe("pass");
		expect(report.summary.fail).toBe(0);
		expect(report.summary.warn).toBe(0);
	});

	it("flags backend reachability failure", () => {
		const report = buildDiagnosticsReport({
			runtimeSnapshot: {
				...BASE_RUNTIME,
				backendReachable: false,
				backendError: "Failed to fetch",
				backendHttpStatus: null,
			},
			runtimeDisabledReason: null,
			runtimeError: null,
			contentSnapshot: BASE_CONTENT,
			contentDisabledReason: null,
			contentError: null,
		});

		const backendCheck = report.checks.find(
			(check) => check.id === "backend_reachable",
		);
		expect(backendCheck?.status).toBe("fail");
		expect(report.overallStatus).toBe("fail");
	});

	it("warns when runtime diagnostics are disabled by developer mode gate", () => {
		const report = buildDiagnosticsReport({
			runtimeSnapshot: null,
			runtimeDisabledReason: "Developer mode is disabled.",
			runtimeError: null,
			contentSnapshot: null,
			contentDisabledReason: null,
			contentError: null,
		});

		expect(report.overallStatus).toBe("warn");
		expect(report.checks.some((check) => check.id === "diagnostics_gate")).toBe(
			true,
		);
	});
});
