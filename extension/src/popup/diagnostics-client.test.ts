import { describe, expect, it } from "bun:test";
import type {
	ContentDiagnosticsResponse,
	RuntimeDiagnosticsResponse,
} from "../lib/diagnostics";
import { DiagnosticsClient } from "./diagnostics-client";

const RUNTIME_OK: RuntimeDiagnosticsResponse = {
	status: "ok",
	snapshot: {
		devModeEnabled: true,
		enabled: true,
		hasJwt: true,
		activeTabId: 7,
		activeTabUrl: "https://www.linkedin.com/feed/",
		activeTabHost: "www.linkedin.com",
		supportedPlatformId: "linkedin",
		backendReachable: true,
		backendLatencyMs: 10,
		backendHttpStatus: 200,
		backendError: null,
	},
};

const CONTENT_OK: ContentDiagnosticsResponse = {
	status: "ok",
	snapshot: {
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
	},
};

describe("DiagnosticsClient", () => {
	it("returns pass report when runtime and content snapshots are healthy", async () => {
		const client = new DiagnosticsClient({
			requestRuntimeDiagnostics: async () => RUNTIME_OK,
			requestContentDiagnostics: async () => CONTENT_OK,
		});

		const report = await client.run();
		expect(report.overallStatus).toBe("pass");
		expect(report.summary.fail).toBe(0);
	});

	it("returns disabled report when runtime diagnostics are gated by developer mode", async () => {
		const client = new DiagnosticsClient({
			requestRuntimeDiagnostics: async () => ({
				status: "disabled",
				reason: "Developer mode is disabled.",
			}),
		});

		const report = await client.run();
		const gateCheck = report.checks.find(
			(check) => check.id === "diagnostics_gate",
		);
		expect(gateCheck?.status).toBe("warn");
		expect(report.overallStatus).toBe("warn");
	});

	it("skips content diagnostics when active tab is unsupported", async () => {
		const client = new DiagnosticsClient({
			requestRuntimeDiagnostics: async () => ({
				...RUNTIME_OK,
				snapshot: {
					...RUNTIME_OK.snapshot!,
					activeTabUrl: "https://google.com",
					activeTabHost: "google.com",
					supportedPlatformId: null,
				},
			}),
			requestContentDiagnostics: async () => {
				throw new Error("should not be called");
			},
		});

		const report = await client.run();
		const contentCheck = report.checks.find(
			(check) => check.id === "content_script_reachable",
		);
		expect(contentCheck?.status).toBe("warn");
		expect(contentCheck?.evidence).toContain("Skipped");
	});
});
