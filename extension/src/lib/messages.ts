// extension/src/lib/messages.ts
import {
	BatchClassifyResult,
	LocalStatsSnapshot,
	PostData,
	ProviderSettings,
} from "../types";
import type {
	ContentDiagnosticsResponse,
	RuntimeDiagnosticsResponse,
} from "./diagnostics";

export const MESSAGE_TYPES = {
	CLASSIFY_BATCH: "CLASSIFY_BATCH",
	CLASSIFY_BATCH_RESULT: "CLASSIFY_BATCH_RESULT",
	TOGGLE_ENABLED: "TOGGLE_ENABLED",
	GET_RUNTIME_DIAGNOSTICS: "GET_RUNTIME_DIAGNOSTICS",
	GET_CONTENT_DIAGNOSTICS: "GET_CONTENT_DIAGNOSTICS",
	GET_PROVIDER_SETTINGS: "GET_PROVIDER_SETTINGS",
	SET_PROVIDER_SETTINGS: "SET_PROVIDER_SETTINGS",
	GET_LOCAL_STATS: "GET_LOCAL_STATS",
} as const;

export type MessageType = (typeof MESSAGE_TYPES)[keyof typeof MESSAGE_TYPES];

export type ClassifyBatchMessage = {
	type: typeof MESSAGE_TYPES.CLASSIFY_BATCH;
	posts: PostData[];
};

export type ClassifyBatchResultMessage = {
	type: typeof MESSAGE_TYPES.CLASSIFY_BATCH_RESULT;
	item: BatchClassifyResult;
};

export type ToggleEnabledMessage = {
	type: typeof MESSAGE_TYPES.TOGGLE_ENABLED;
};

export type GetRuntimeDiagnosticsMessage = {
	type: typeof MESSAGE_TYPES.GET_RUNTIME_DIAGNOSTICS;
};

export type GetContentDiagnosticsMessage = {
	type: typeof MESSAGE_TYPES.GET_CONTENT_DIAGNOSTICS;
};

export type GetProviderSettingsMessage = {
	type: typeof MESSAGE_TYPES.GET_PROVIDER_SETTINGS;
};

export type SetProviderSettingsMessage = {
	type: typeof MESSAGE_TYPES.SET_PROVIDER_SETTINGS;
	settings: ProviderSettings;
};

export type GetLocalStatsMessage = {
	type: typeof MESSAGE_TYPES.GET_LOCAL_STATS;
};

export type RuntimeRequest =
	| ClassifyBatchMessage
	| ClassifyBatchResultMessage
	| ToggleEnabledMessage
	| GetRuntimeDiagnosticsMessage
	| GetContentDiagnosticsMessage
	| GetProviderSettingsMessage
	| SetProviderSettingsMessage
	| GetLocalStatsMessage;

export type SetProviderSettingsResponse =
	| { status: "ok" }
	| { status: "invalid_base_url"; reason: string }
	| { status: "permission_denied"; origin: string };

export type RuntimeResponseByType = {
	[MESSAGE_TYPES.CLASSIFY_BATCH]: { status: "ok" | "disabled" | "error" };
	[MESSAGE_TYPES.CLASSIFY_BATCH_RESULT]: undefined;
	[MESSAGE_TYPES.TOGGLE_ENABLED]: { enabled: boolean };
	[MESSAGE_TYPES.GET_RUNTIME_DIAGNOSTICS]: RuntimeDiagnosticsResponse;
	[MESSAGE_TYPES.GET_CONTENT_DIAGNOSTICS]: ContentDiagnosticsResponse;
	[MESSAGE_TYPES.GET_PROVIDER_SETTINGS]: ProviderSettings | null;
	[MESSAGE_TYPES.SET_PROVIDER_SETTINGS]: SetProviderSettingsResponse;
	[MESSAGE_TYPES.GET_LOCAL_STATS]: LocalStatsSnapshot;
};

export type RuntimeResponse<T extends MessageType> = RuntimeResponseByType[T];
