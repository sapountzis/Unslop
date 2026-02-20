import { describe, expect, it } from "bun:test";
import { DiagnosticsEngine } from "./diagnosticsEngine";
import type { StorageFacade } from "./storageFacade";

function createStorageFacadeMock(
	overrides: Partial<StorageFacade> = {},
): StorageFacade {
	return {
		getJwt: async () => "jwt-token",
		getAuthState: async () => ({ jwt: "jwt-token", enabled: true }),
		getDevMode: async () => true,
		setJwt: async () => {},
		clearJwt: async () => {},
		toggleEnabled: async () => false,
		toggleDevMode: async () => false,
		...overrides,
	};
}

describe("diagnostics engine", () => {
	it("returns disabled response when developer mode is off", async () => {
		let queriedTabs = 0;
		let probedBackend = 0;
		const engine = new DiagnosticsEngine({
			storageFacade: createStorageFacadeMock({
				getDevMode: async () => false,
			}),
			queryTabsFn: async () => {
				queriedTabs += 1;
				return [];
			},
			probeBackendReachabilityFn: async () => {
				probedBackend += 1;
				return {
					reachable: true,
					latencyMs: 5,
					httpStatus: 200,
					error: null,
				};
			},
		});

		const response = await engine.collectRuntimeDiagnostics();

		expect(response).toEqual({
			status: "disabled",
			reason: "Developer mode is disabled.",
		});
		expect(queriedTabs).toBe(0);
		expect(probedBackend).toBe(0);
	});

	it("collects active tab and backend probe when developer mode is on", async () => {
		const engine = new DiagnosticsEngine({
			storageFacade: createStorageFacadeMock(),
			queryTabsFn: async () =>
				[
					{
						id: 55,
						url: "https://x.com/home",
					},
				] as chrome.tabs.Tab[],
			probeBackendReachabilityFn: async () => ({
				reachable: true,
				latencyMs: 12,
				httpStatus: 404,
				error: null,
			}),
		});

		const response = await engine.collectRuntimeDiagnostics();
		expect(response.status).toBe("ok");
		expect(response.snapshot?.supportedPlatformId).toBe("x");
		expect(response.snapshot?.backendReachable).toBe(true);
		expect(response.snapshot?.backendHttpStatus).toBe(404);
	});
});
