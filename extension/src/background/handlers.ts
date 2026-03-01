// extension/src/background/handlers.ts
import { LocalClassificationService } from "./localClassifier";
import { DiagnosticsEngine } from "./diagnosticsEngine";
import { createStorageFacade, type StorageFacade } from "./storageFacade";
import {
	createLocalStatsStore,
	type LocalStatsStore,
} from "./localStatsStore";
import {
	ensureProviderEndpointPermission,
	type ProviderPermissionResult,
} from "./providerPermissions";
import {
	MESSAGE_TYPES,
	type ClassifyBatchMessage,
	type RuntimeRequest,
	type SetProviderSettingsMessage,
} from "../lib/messages";
import type { RuntimeMessageHandlers } from "./messageRouter";
import type { Decision } from "../types";

type QueryTabs = (
	queryInfo: chrome.tabs.QueryInfo,
) => Promise<chrome.tabs.Tab[]>;
type SendTabMessage = (tabId: number, message: unknown) => Promise<void>;
type EnsureProviderPermissionFn = (
	baseUrl: string,
) => Promise<ProviderPermissionResult>;

type BackgroundHandlerDependencies = {
	storageFacade?: StorageFacade;
	classificationService?: LocalClassificationService;
	diagnosticsEngine?: DiagnosticsEngine;
	localStatsStore?: LocalStatsStore;
	ensureProviderPermissionFn?: EnsureProviderPermissionFn;
	queryTabsFn?: QueryTabs;
	sendTabMessageFn?: SendTabMessage;
};

function getClassifyBatchMessage(
	message: RuntimeRequest,
): ClassifyBatchMessage {
	return message as ClassifyBatchMessage;
}

function getSetProviderSettingsMessage(
	message: RuntimeRequest,
): SetProviderSettingsMessage {
	return message as SetProviderSettingsMessage;
}

function resolveFinalDecision(item: { decision?: Decision }): Decision {
	return item.decision === "hide" ? "hide" : "keep";
}

export function createBackgroundMessageHandlers(
	dependencies: BackgroundHandlerDependencies = {},
): RuntimeMessageHandlers {
	const storageFacade = dependencies.storageFacade ?? createStorageFacade();
	const queryTabsFn =
		dependencies.queryTabsFn ??
		(async (queryInfo) => await chrome.tabs.query(queryInfo));
	const localStatsStore =
		dependencies.localStatsStore ?? createLocalStatsStore();
	const sendTabMessageFn =
		dependencies.sendTabMessageFn ??
		(async (tabId, message) => {
			await chrome.tabs.sendMessage(tabId, message);
		});
	const ensureProviderPermissionFn =
		dependencies.ensureProviderPermissionFn ??
		(async (baseUrl) => await ensureProviderEndpointPermission(baseUrl));
	const classificationService =
		dependencies.classificationService ??
		new LocalClassificationService({ sendTabMessageFn });
	const diagnosticsEngine =
		dependencies.diagnosticsEngine ??
		new DiagnosticsEngine({
			storageFacade,
			queryTabsFn,
		});

	return {
		async [MESSAGE_TYPES.CLASSIFY_BATCH](message, sender) {
			const classifyMessage = getClassifyBatchMessage(message);
			const [hasKey, enabled] = await Promise.all([
				storageFacade.hasApiKey(),
				storageFacade.getEnabled(),
			]);

			if (!hasKey || !enabled) {
				return { status: "disabled" };
			}

			const tabId = sender.tab?.id;
			if (typeof tabId !== "number") {
				return { status: "error" };
			}

			const settings = await storageFacade.getProviderSettings();
			classificationService.classifyBatch(
				classifyMessage.posts,
				settings,
				tabId,
				(item) => {
					void localStatsStore
						.incrementDecision(resolveFinalDecision(item))
						.catch((error) => {
							console.error("[Unslop][stats] failed to increment", error);
						});
				},
			);

			return { status: "ok" };
		},

		async [MESSAGE_TYPES.TOGGLE_ENABLED]() {
			return { enabled: await storageFacade.toggleEnabled() };
		},

		async [MESSAGE_TYPES.GET_PROVIDER_SETTINGS]() {
			const hasKey = await storageFacade.hasApiKey();
			if (!hasKey) return null;
			return await storageFacade.getProviderSettings();
		},

		async [MESSAGE_TYPES.SET_PROVIDER_SETTINGS](message) {
			const msg = getSetProviderSettingsMessage(message);
			const permissionResult = await ensureProviderPermissionFn(
				msg.settings.baseUrl,
			);
			if (permissionResult.status === "invalid_base_url") {
				return {
					status: "invalid_base_url",
					reason: permissionResult.reason,
				};
			}
			if (permissionResult.status === "permission_denied") {
				return {
					status: "permission_denied",
					origin: permissionResult.origin,
				};
			}

			await storageFacade.setProviderSettings({
				...msg.settings,
				baseUrl: permissionResult.normalizedBaseUrl,
			});
			return { status: "ok" };
		},

		async [MESSAGE_TYPES.GET_LOCAL_STATS]() {
			return await localStatsStore.getLocalStats();
		},

		async [MESSAGE_TYPES.GET_RUNTIME_DIAGNOSTICS]() {
			return await diagnosticsEngine.collectRuntimeDiagnostics();
		},
	};
}
