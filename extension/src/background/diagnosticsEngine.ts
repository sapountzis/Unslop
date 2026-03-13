// extension/src/background/diagnosticsEngine.ts
import type { RuntimeDiagnosticsResponse } from "../lib/diagnostics";
import type { StorageFacade } from "./storageFacade";
import {
	buildRuntimeDiagnosticsSnapshot,
	probeLlmReachability,
	type LlmProbeResult,
} from "./runtimeDiagnostics";

type QueryTabs = (
	queryInfo: chrome.tabs.QueryInfo,
) => Promise<chrome.tabs.Tab[]>;

type DiagnosticsEngineDependencies = {
	storageFacade: StorageFacade;
	queryTabsFn?: QueryTabs;
	probeLlmReachabilityFn?: typeof probeLlmReachability;
};

export class DiagnosticsEngine {
	private readonly storageFacade: StorageFacade;
	private readonly queryTabsFn: QueryTabs;
	private readonly probeLlmReachabilityFn: typeof probeLlmReachability;

	constructor(dependencies: DiagnosticsEngineDependencies) {
		this.storageFacade = dependencies.storageFacade;
		this.queryTabsFn =
			dependencies.queryTabsFn ??
			(async (queryInfo) => await chrome.tabs.query(queryInfo));
		this.probeLlmReachabilityFn =
			dependencies.probeLlmReachabilityFn ?? probeLlmReachability;
	}

	async collectRuntimeDiagnostics(): Promise<RuntimeDiagnosticsResponse> {
		try {
			const devModeEnabled = await this.storageFacade.getDevMode();
			if (!devModeEnabled) {
				return {
					status: "disabled",
					reason: "Developer mode is disabled.",
				};
			}

			const [hasApiKey, settings, [activeTab]] = await Promise.all([
				this.storageFacade.hasApiKey(),
				this.storageFacade.getProviderSettings(),
				this.queryTabsFn({ active: true, currentWindow: true }),
			]);

			let llmProbe: LlmProbeResult;
			if (hasApiKey) {
				llmProbe = await this.probeLlmReachabilityFn(
					settings.baseUrl,
					settings.apiKey,
					settings.model,
				);
			} else {
				llmProbe = {
					reachable: false,
					latencyMs: null,
					httpStatus: null,
					error: "No API key configured",
				};
			}

			const enabled = await this.storageFacade.getEnabled();

			return {
				status: "ok",
				snapshot: buildRuntimeDiagnosticsSnapshot({
					devModeEnabled,
					enabled,
					hasApiKey,
					activeTab,
					llmProbe,
				}),
			};
		} catch (error) {
			return {
				status: "error",
				reason:
					error instanceof Error
						? error.message || "Unknown diagnostics error."
						: "Unknown diagnostics error.",
			};
		}
	}
}
