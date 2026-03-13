// extension/src/background/diagnosticsEngine.test.ts
import { describe, expect, it } from "bun:test";
import { DiagnosticsEngine } from "./diagnosticsEngine";
import type { StorageFacade } from "./storageFacade";
import { DEFAULT_BASE_URL, DEFAULT_MODEL } from "../lib/config";

function createStorageFacadeMock(
	overrides: Partial<StorageFacade> = {},
): StorageFacade {
	return {
		getProviderSettings: async () => ({
			apiKey: "sk-test",
			baseUrl: DEFAULT_BASE_URL,
			model: DEFAULT_MODEL,
		}),
		setProviderSettings: async () => { },
		hasApiKey: async () => true,
		getEnabled: async () => true,
		getDevMode: async () => true,
		toggleEnabled: async () => false,
		toggleDevMode: async () => false,
		...overrides,
	};
}

describe("diagnostics engine", () => {
	it("returns disabled response when developer mode is off", async () => {
		let queriedTabs = 0;
		let probedLlm = 0;
		const engine = new DiagnosticsEngine({
			storageFacade: createStorageFacadeMock({
				getDevMode: async () => false,
			}),
			queryTabsFn: async () => {
				queriedTabs += 1;
				return [];
			},
			probeLlmReachabilityFn: async () => {
				probedLlm += 1;
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
		expect(probedLlm).toBe(0);
	});

	it("collects active tab and llm probe when developer mode is on", async () => {
		const probeCalls: Array<{
			baseUrl: string;
			apiKey: string;
			model: string;
		}> = [];
		const engine = new DiagnosticsEngine({
			storageFacade: createStorageFacadeMock(),
			queryTabsFn: async () =>
				[
					{
						id: 55,
						url: "https://x.com/home",
					},
				] as chrome.tabs.Tab[],
			probeLlmReachabilityFn: async (baseUrl, apiKey, model) => {
				probeCalls.push({ baseUrl, apiKey, model });
				return {
					reachable: true,
					latencyMs: 12,
					httpStatus: 200,
					error: null,
				};
			},
		});

		const response = await engine.collectRuntimeDiagnostics();
		expect(response.status).toBe("ok");
		expect(response.snapshot?.supportedPlatformId).toBe("x");
		expect(response.snapshot?.llmEndpointReachable).toBe(true);
		expect(response.snapshot?.llmEndpointHttpStatus).toBe(200);
		expect(response.snapshot?.hasApiKey).toBe(true);
		expect(probeCalls).toEqual([
			{
				baseUrl: DEFAULT_BASE_URL,
				apiKey: "sk-test",
				model: DEFAULT_MODEL,
			},
		]);
	});

	it("marks llm endpoint as unreachable when no api key is configured", async () => {
		const engine = new DiagnosticsEngine({
			storageFacade: createStorageFacadeMock({
				hasApiKey: async () => false,
			}),
			queryTabsFn: async () => [],
			probeLlmReachabilityFn: async () => {
				throw new Error("Should not be called without API key");
			},
		});

		const response = await engine.collectRuntimeDiagnostics();
		expect(response.status).toBe("ok");
		expect(response.snapshot?.llmEndpointReachable).toBe(false);
		expect(response.snapshot?.hasApiKey).toBe(false);
	});
});
