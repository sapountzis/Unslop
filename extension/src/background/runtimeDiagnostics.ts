import { API_BASE_URL, BACKEND_PROBE_TIMEOUT_MS } from "../lib/config";
import type { RuntimeDiagnosticsSnapshot } from "../lib/diagnostics";
import {
	getHostname,
	resolveSupportedPlatformIdFromUrl,
} from "../platforms/registry";

export type BackendProbeResult = {
	reachable: boolean;
	latencyMs: number | null;
	httpStatus: number | null;
	error: string | null;
};

type BuildRuntimeDiagnosticsSnapshotInput = {
	devModeEnabled: boolean;
	enabled: boolean;
	hasJwt: boolean;
	activeTab: chrome.tabs.Tab | undefined;
	backendProbe: BackendProbeResult;
};

export async function probeBackendReachability(
	fetchFn: typeof fetch = fetch,
): Promise<BackendProbeResult> {
	const start = Date.now();
	const controller = new AbortController();
	const timeoutHandle = setTimeout(() => {
		controller.abort();
	}, BACKEND_PROBE_TIMEOUT_MS);

	try {
		const response = await fetchFn(API_BASE_URL, {
			method: "GET",
			cache: "no-store",
			signal: controller.signal,
		});
		return {
			reachable: true,
			latencyMs: Date.now() - start,
			httpStatus: response.status,
			error: null,
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
		hasJwt: input.hasJwt,
		activeTabId:
			typeof input.activeTab?.id === "number" ? input.activeTab.id : null,
		activeTabUrl,
		activeTabHost,
		supportedPlatformId: resolveSupportedPlatformIdFromUrl(activeTabUrl),
		backendReachable: input.backendProbe.reachable,
		backendLatencyMs: input.backendProbe.latencyMs,
		backendHttpStatus: input.backendProbe.httpStatus,
		backendError: input.backendProbe.error,
	};
}
