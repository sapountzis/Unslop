import { describe, expect, it } from "bun:test";
import { buildRuntimeDiagnosticsSnapshot } from "./runtimeDiagnostics";

describe("runtime diagnostics helpers", () => {
	it("builds a runtime snapshot with platform support and backend probe signals", () => {
		const snapshot = buildRuntimeDiagnosticsSnapshot({
			devModeEnabled: true,
			enabled: true,
			hasJwt: true,
			activeTab: {
				id: 88,
				url: "https://www.linkedin.com/feed/",
			} as chrome.tabs.Tab,
			backendProbe: {
				reachable: true,
				latencyMs: 24,
				httpStatus: 200,
				error: null,
			},
		});

		expect(snapshot).toEqual({
			devModeEnabled: true,
			enabled: true,
			hasJwt: true,
			activeTabId: 88,
			activeTabUrl: "https://www.linkedin.com/feed/",
			activeTabHost: "www.linkedin.com",
			supportedPlatformId: "linkedin",
			backendReachable: true,
			backendLatencyMs: 24,
			backendHttpStatus: 200,
			backendError: null,
		});
	});
});
