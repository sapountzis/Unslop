// extension/src/background/runtimeDiagnostics.test.ts
import { describe, expect, it } from "bun:test";
import {
	buildRuntimeDiagnosticsSnapshot,
	probeLlmReachability,
} from "./runtimeDiagnostics";

describe("runtime diagnostics helpers", () => {
	it("builds a runtime snapshot with platform support and llm probe signals", () => {
		const snapshot = buildRuntimeDiagnosticsSnapshot({
			devModeEnabled: true,
			enabled: true,
			hasApiKey: true,
			activeTab: {
				id: 88,
				url: "https://www.linkedin.com/feed/",
			} as chrome.tabs.Tab,
			llmProbe: {
				reachable: true,
				latencyMs: 24,
				httpStatus: 200,
				error: null,
			},
		});

		expect(snapshot).toEqual({
			devModeEnabled: true,
			enabled: true,
			hasApiKey: true,
			activeTabId: 88,
			activeTabUrl: "https://www.linkedin.com/feed/",
			activeTabHost: "www.linkedin.com",
			supportedPlatformId: "linkedin",
			llmEndpointReachable: true,
			llmEndpointLatencyMs: 24,
			llmEndpointHttpStatus: 200,
			llmEndpointError: null,
		});
	});

	it("probes LLM reachability via chat/completions with a tiny OK prompt", async () => {
		let requestedUrl = "";
		let requestInit: RequestInit | undefined;
		const fetchMock = (async (input: string | URL | Request, init?: RequestInit) => {
			requestedUrl =
				typeof input === "string"
					? input
					: input instanceof URL
						? input.toString()
						: input.url;
			requestInit = init;
			return new Response(
				JSON.stringify({
					choices: [{ message: { content: "OK" } }],
				}),
				{
					status: 200,
					headers: { "content-type": "application/json" },
				},
			);
		}) as typeof fetch;

		const result = await probeLlmReachability(
			"https://openrouter.ai/api/v1/",
			"sk-test",
			"openai/gpt-4o-mini",
			fetchMock,
		);

		expect(result.reachable).toBe(true);
		expect(result.httpStatus).toBe(200);
		expect(requestedUrl).toBe(
			"https://openrouter.ai/api/v1/chat/completions",
		);
		expect(requestInit?.method).toBe("POST");
		const payload = JSON.parse((requestInit?.body as string) ?? "{}") as {
			model?: string;
			messages?: Array<{ role: string; content: string }>;
		};
		expect(payload.model).toBe("openai/gpt-4o-mini");
		expect(payload.messages?.length).toBe(2);
		expect(payload.messages?.[1]?.content).toContain("OK");
	});
});
