import {
	BatchClassifyResult,
	PostData,
	StatsInfo,
	UserInfoWithUsage,
} from "../types";
import type {
	ContentDiagnosticsResponse,
	RuntimeDiagnosticsResponse,
} from "./diagnostics";

export const MESSAGE_TYPES = {
	CLASSIFY_BATCH: "CLASSIFY_BATCH",
	CLASSIFY_BATCH_RESULT: "CLASSIFY_BATCH_RESULT",
	GET_USER_INFO: "GET_USER_INFO",
	CREATE_CHECKOUT: "CREATE_CHECKOUT",
	START_AUTH: "START_AUTH",
	SET_JWT: "SET_JWT",
	CLEAR_JWT: "CLEAR_JWT",
	TOGGLE_ENABLED: "TOGGLE_ENABLED",
	GET_STATS: "GET_STATS",
	GET_RUNTIME_DIAGNOSTICS: "GET_RUNTIME_DIAGNOSTICS",
	GET_CONTENT_DIAGNOSTICS: "GET_CONTENT_DIAGNOSTICS",
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

export type GetUserInfoMessage = {
	type: typeof MESSAGE_TYPES.GET_USER_INFO;
};

export type CreateCheckoutMessage = {
	type: typeof MESSAGE_TYPES.CREATE_CHECKOUT;
};

export type StartAuthMessage = {
	type: typeof MESSAGE_TYPES.START_AUTH;
	email: string;
};

export type SetJwtMessage = {
	type: typeof MESSAGE_TYPES.SET_JWT;
	jwt: string;
};

export type ClearJwtMessage = {
	type: typeof MESSAGE_TYPES.CLEAR_JWT;
};

export type ToggleEnabledMessage = {
	type: typeof MESSAGE_TYPES.TOGGLE_ENABLED;
};

export type GetStatsMessage = {
	type: typeof MESSAGE_TYPES.GET_STATS;
};

export type GetRuntimeDiagnosticsMessage = {
	type: typeof MESSAGE_TYPES.GET_RUNTIME_DIAGNOSTICS;
};

export type GetContentDiagnosticsMessage = {
	type: typeof MESSAGE_TYPES.GET_CONTENT_DIAGNOSTICS;
};

export type RuntimeRequest =
	| ClassifyBatchMessage
	| GetUserInfoMessage
	| CreateCheckoutMessage
	| StartAuthMessage
	| SetJwtMessage
	| ClearJwtMessage
	| ToggleEnabledMessage
	| GetStatsMessage
	| GetRuntimeDiagnosticsMessage
	| GetContentDiagnosticsMessage;

export type RuntimeResponseByType = {
	[MESSAGE_TYPES.CLASSIFY_BATCH]: { status: "ok" | "disabled" | "error" };
	[MESSAGE_TYPES.CLASSIFY_BATCH_RESULT]: undefined;
	[MESSAGE_TYPES.GET_USER_INFO]: UserInfoWithUsage | null; // Now includes usage data (UserInfoWithUsage)
	[MESSAGE_TYPES.CREATE_CHECKOUT]: { checkout_url: string | null };
	[MESSAGE_TYPES.START_AUTH]: { status: "ok" };
	[MESSAGE_TYPES.SET_JWT]: { status: "ok" };
	[MESSAGE_TYPES.CLEAR_JWT]: { status: "ok" };
	[MESSAGE_TYPES.TOGGLE_ENABLED]: { enabled: boolean };
	[MESSAGE_TYPES.GET_STATS]: StatsInfo | null;
	[MESSAGE_TYPES.GET_RUNTIME_DIAGNOSTICS]: RuntimeDiagnosticsResponse;
	[MESSAGE_TYPES.GET_CONTENT_DIAGNOSTICS]: ContentDiagnosticsResponse;
};

export type RuntimeResponse<T extends MessageType> = RuntimeResponseByType[T];
