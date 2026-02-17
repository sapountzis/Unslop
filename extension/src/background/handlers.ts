import {
	createCheckout,
	getStats,
	getUserInfoWithUsage,
	startAuthFlow,
} from "./api";
import { streamClassifyBatch } from "./classify-pipeline";
import { ClassificationService } from "./classification-service";
import { createStorageFacade, type StorageFacade } from "./storage-facade";
import {
	buildRuntimeDiagnosticsSnapshot,
	isSupportedFeedUrl,
} from "./runtime-diagnostics";
import {
	MESSAGE_TYPES,
	type ClassifyBatchMessage,
	type ReloadActiveTabMessage,
	type RuntimeRequest,
	type StartAuthMessage,
	type SetJwtMessage,
} from "../lib/messages";
import type { RuntimeMessageHandlers } from "./message-router";

type QueryTabs = (
	queryInfo: chrome.tabs.QueryInfo,
) => Promise<chrome.tabs.Tab[]>;
type GetTab = (tabId: number) => Promise<chrome.tabs.Tab | null>;
type ReloadTab = (tabId: number) => Promise<void>;
type SendTabMessage = (tabId: number, message: unknown) => Promise<void>;

type BackgroundHandlerDependencies = {
	storageFacade?: StorageFacade;
	classificationService?: ClassificationService;
	getUserInfoWithUsageFn?: typeof getUserInfoWithUsage;
	createCheckoutFn?: typeof createCheckout;
	startAuthFlowFn?: typeof startAuthFlow;
	getStatsFn?: typeof getStats;
	streamClassifyBatchFn?: typeof streamClassifyBatch;
	queryTabsFn?: QueryTabs;
	getTabFn?: GetTab;
	reloadTabFn?: ReloadTab;
	sendTabMessageFn?: SendTabMessage;
};

function getClassifyBatchMessage(
	message: RuntimeRequest,
): ClassifyBatchMessage {
	return message as ClassifyBatchMessage;
}

function getStartAuthMessage(message: RuntimeRequest): StartAuthMessage {
	return message as StartAuthMessage;
}

function getSetJwtMessage(message: RuntimeRequest): SetJwtMessage {
	return message as SetJwtMessage;
}

function getReloadActiveTabMessage(
	message: RuntimeRequest,
): ReloadActiveTabMessage {
	return message as ReloadActiveTabMessage;
}

export function createBackgroundMessageHandlers(
	dependencies: BackgroundHandlerDependencies = {},
): RuntimeMessageHandlers {
	const storageFacade = dependencies.storageFacade ?? createStorageFacade();
	const getUserInfoWithUsageFn =
		dependencies.getUserInfoWithUsageFn ?? getUserInfoWithUsage;
	const createCheckoutFn = dependencies.createCheckoutFn ?? createCheckout;
	const startAuthFlowFn = dependencies.startAuthFlowFn ?? startAuthFlow;
	const getStatsFn = dependencies.getStatsFn ?? getStats;
	const streamClassifyBatchFn =
		dependencies.streamClassifyBatchFn ?? streamClassifyBatch;
	const queryTabsFn =
		dependencies.queryTabsFn ??
		(async (queryInfo) => await chrome.tabs.query(queryInfo));
	const getTabFn =
		dependencies.getTabFn ??
		(async (tabId) => await chrome.tabs.get(tabId).catch(() => null));
	const reloadTabFn =
		dependencies.reloadTabFn ??
		(async (tabId) => {
			await chrome.tabs.reload(tabId);
		});
	const sendTabMessageFn =
		dependencies.sendTabMessageFn ??
		(async (tabId, message) => {
			await chrome.tabs.sendMessage(tabId, message);
		});
	const classificationService =
		dependencies.classificationService ??
		new ClassificationService({
			streamClassifyBatchFn,
			sendTabMessageFn,
		});

	return {
		async [MESSAGE_TYPES.CLASSIFY_BATCH](message, sender) {
			const classifyMessage = getClassifyBatchMessage(message);
			const authState = await storageFacade.getAuthState();

			if (!authState.jwt || !authState.enabled) {
				return { status: "disabled" };
			}

			const tabId = sender.tab?.id;
			if (typeof tabId !== "number") {
				return { status: "error" };
			}

			classificationService.classifyForTab(
				classifyMessage,
				authState.jwt,
				tabId,
			);

			return { status: "ok" };
		},

		async [MESSAGE_TYPES.GET_USER_INFO]() {
			const jwt = await storageFacade.getJwt();
			if (!jwt) return null;
			return await getUserInfoWithUsageFn(jwt);
		},

		async [MESSAGE_TYPES.CREATE_CHECKOUT]() {
			const jwt = await storageFacade.getJwt();
			if (!jwt) return { checkout_url: null };
			return { checkout_url: await createCheckoutFn(jwt) };
		},

		async [MESSAGE_TYPES.START_AUTH](message) {
			const startAuthMessage = getStartAuthMessage(message);
			await startAuthFlowFn(startAuthMessage.email);
			return { status: "ok" };
		},

		async [MESSAGE_TYPES.SET_JWT](message) {
			const setJwtMessage = getSetJwtMessage(message);
			await storageFacade.setJwt(setJwtMessage.jwt);
			return { status: "ok" };
		},

		async [MESSAGE_TYPES.CLEAR_JWT]() {
			await storageFacade.clearJwt();
			return { status: "ok" };
		},

		async [MESSAGE_TYPES.TOGGLE_ENABLED]() {
			return { enabled: await storageFacade.toggleEnabled() };
		},

		async [MESSAGE_TYPES.RELOAD_ACTIVE_TAB](message) {
			const reloadActiveTabMessage = getReloadActiveTabMessage(message);
			const tab = await getTabFn(reloadActiveTabMessage.tabId);
			if (!tab?.id || !tab.url || !isSupportedFeedUrl(tab.url)) {
				return { status: "ignored" };
			}

			await reloadTabFn(tab.id);
			return { status: "reloaded" };
		},

		async [MESSAGE_TYPES.GET_STATS]() {
			const jwt = await storageFacade.getJwt();
			if (!jwt) return null;
			return await getStatsFn(jwt);
		},

		async [MESSAGE_TYPES.GET_RUNTIME_DIAGNOSTICS]() {
			const authState = await storageFacade.getAuthState();
			const [activeTab] = await queryTabsFn({
				active: true,
				currentWindow: true,
			});

			return {
				status: "ok",
				snapshot: buildRuntimeDiagnosticsSnapshot({
					enabled: authState.enabled,
					hasJwt: authState.jwt !== null,
					activeTab,
				}),
			};
		},
	};
}
