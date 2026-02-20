import {
	createCheckout,
	getStats,
	getUserInfoWithUsage,
	startAuthFlow,
} from "./api";
import { streamClassifyBatch } from "./classifyPipeline";
import { ClassificationService } from "./classificationService";
import { DiagnosticsEngine } from "./diagnosticsEngine";
import { createStorageFacade, type StorageFacade } from "./storageFacade";
import {
	MESSAGE_TYPES,
	type ClassifyBatchMessage,
	type RuntimeRequest,
	type StartAuthMessage,
	type SetJwtMessage,
} from "../lib/messages";
import type { RuntimeMessageHandlers } from "./messageRouter";

type QueryTabs = (
	queryInfo: chrome.tabs.QueryInfo,
) => Promise<chrome.tabs.Tab[]>;
type SendTabMessage = (tabId: number, message: unknown) => Promise<void>;

type BackgroundHandlerDependencies = {
	storageFacade?: StorageFacade;
	classificationService?: ClassificationService;
	diagnosticsEngine?: DiagnosticsEngine;
	getUserInfoWithUsageFn?: typeof getUserInfoWithUsage;
	createCheckoutFn?: typeof createCheckout;
	startAuthFlowFn?: typeof startAuthFlow;
	getStatsFn?: typeof getStats;
	streamClassifyBatchFn?: typeof streamClassifyBatch;
	queryTabsFn?: QueryTabs;
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
	const diagnosticsEngine =
		dependencies.diagnosticsEngine ??
		new DiagnosticsEngine({
			storageFacade,
			queryTabsFn,
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

		async [MESSAGE_TYPES.GET_STATS]() {
			const jwt = await storageFacade.getJwt();
			if (!jwt) return null;
			return await getStatsFn(jwt);
		},

		async [MESSAGE_TYPES.GET_RUNTIME_DIAGNOSTICS]() {
			return await diagnosticsEngine.collectRuntimeDiagnostics();
		},
	};
}
