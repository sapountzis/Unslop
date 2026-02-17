import type { RuntimeDiagnosticsResponse } from "../lib/diagnostics";
import type { StorageFacade } from "./storage-facade";
import {
	buildRuntimeDiagnosticsSnapshot,
	probeBackendReachability,
} from "./runtime-diagnostics";

type QueryTabs = (
	queryInfo: chrome.tabs.QueryInfo,
) => Promise<chrome.tabs.Tab[]>;

type DiagnosticsEngineDependencies = {
	storageFacade: StorageFacade;
	queryTabsFn?: QueryTabs;
	probeBackendReachabilityFn?: typeof probeBackendReachability;
};

export class DiagnosticsEngine {
	private readonly storageFacade: StorageFacade;
	private readonly queryTabsFn: QueryTabs;
	private readonly probeBackendReachabilityFn: typeof probeBackendReachability;

	constructor(dependencies: DiagnosticsEngineDependencies) {
		this.storageFacade = dependencies.storageFacade;
		this.queryTabsFn =
			dependencies.queryTabsFn ??
			(async (queryInfo) => await chrome.tabs.query(queryInfo));
		this.probeBackendReachabilityFn =
			dependencies.probeBackendReachabilityFn ?? probeBackendReachability;
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

			const authState = await this.storageFacade.getAuthState();
			const [activeTab] = await this.queryTabsFn({
				active: true,
				currentWindow: true,
			});
			const backendProbe = await this.probeBackendReachabilityFn();

			return {
				status: "ok",
				snapshot: buildRuntimeDiagnosticsSnapshot({
					devModeEnabled,
					enabled: authState.enabled,
					hasJwt: authState.jwt !== null,
					activeTab,
					backendProbe,
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
