// extension/src/background/runtimeDiagnostics.ts
import { LLM_PROBE_TIMEOUT_MS } from "../lib/config";
import type { RuntimeDiagnosticsSnapshot } from "../lib/diagnostics";
import {
	getHostname,
	resolveSupportedPlatformIdFromUrl,
} from "../platforms/registry";

export type LlmProbeResult = {
	reachable: boolean;
	latencyMs: number | null;
	httpStatus: number | null;
	error: string | null;
};

type BuildRuntimeDiagnosticsSnapshotInput = {
	devModeEnabled: boolean;
	enabled: boolean;
	hasApiKey: boolean;
	activeTab: chrome.tabs.Tab | undefined;
	llmProbe: LlmProbeResult;
};

export async function probeLlmReachability(
	baseUrl: string,
	apiKey: string,
	model: string,
	fetchFn: typeof fetch = fetch,
): Promise<LlmProbeResult> {
	const url = `${baseUrl.replace(/\/+$/, "")}/chat/completions`;
	const body = JSON.stringify({
		model,
		messages: [
			{
				role: "system",
				content: "Reply with exactly OK.",
			},
			{
				role: "user",
				content: "Say only OK.",
			},
		],
		temperature: 0,
		max_tokens: 5,
	});
	const start = Date.now();
	const controller = new AbortController();
	const timeoutHandle = setTimeout(() => {
		controller.abort();
	}, LLM_PROBE_TIMEOUT_MS);

	try {
		const response = await fetchFn(url, {
			method: "POST",
			cache: "no-store",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${apiKey}`,
			},
			body,
			signal: controller.signal,
		});
		let reachable = response.ok;
		let error: string | null = response.ok ? null : `HTTP ${response.status}`;
		if (response.ok) {
			try {
				const data = (await response.json()) as {
					choices?: Array<{ message?: { content?: string | null } }>;
				};
				const content = data.choices?.[0]?.message?.content;
				if (typeof content !== "string" || content.trim().length === 0) {
					reachable = false;
					error = "Empty completion response";
				}
			} catch {
				reachable = false;
				error = "Invalid completion response";
			}
		}
		return {
			reachable,
			latencyMs: Date.now() - start,
			httpStatus: response.status,
			error,
		};
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return {
			reachable: false,
			latencyMs: Date.now() - start,
			httpStatus: null,
			error: message,
		};
	} finally {
		clearTimeout(timeoutHandle);
	}
}

export function buildRuntimeDiagnosticsSnapshot(
	input: BuildRuntimeDiagnosticsSnapshotInput,
): RuntimeDiagnosticsSnapshot {
	const activeTabUrl =
		typeof input.activeTab?.url === "string" ? input.activeTab.url : null;
	const activeTabHost = getHostname(activeTabUrl);

	return {
		devModeEnabled: input.devModeEnabled,
		enabled: input.enabled,
		hasApiKey: input.hasApiKey,
		activeTabId:
			typeof input.activeTab?.id === "number" ? input.activeTab.id : null,
		activeTabUrl,
		activeTabHost,
		supportedPlatformId: resolveSupportedPlatformIdFromUrl(activeTabUrl),
		llmEndpointReachable: input.llmProbe.reachable,
		llmEndpointLatencyMs: input.llmProbe.latencyMs,
		llmEndpointHttpStatus: input.llmProbe.httpStatus,
		llmEndpointError: input.llmProbe.error,
	};
}
