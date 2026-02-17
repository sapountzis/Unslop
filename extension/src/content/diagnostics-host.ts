import { DEV_MODE_STORAGE_KEY, resolveDevMode } from "../lib/dev-mode";
import type { ContentDiagnosticsResponse } from "../lib/diagnostics";
import { MESSAGE_TYPES } from "../lib/messages";
import type { PlatformPlugin } from "../platforms/platform";

type SyncStorageGet = (
	keys: string | string[],
) => Promise<Record<string, unknown>>;

type DiagnosticsHostDependencies = {
	getSync?: SyncStorageGet;
	getCurrentUrl?: () => string;
};

function formatErrorReason(error: unknown): string {
	if (error instanceof Error) {
		return error.message || "Unknown diagnostics error.";
	}
	if (typeof error === "string") {
		return error;
	}
	return "Unknown diagnostics error.";
}

export function registerContentDiagnosticsHost(
	platform: PlatformPlugin,
	dependencies: DiagnosticsHostDependencies = {},
): void {
	const getSync =
		dependencies.getSync ??
		(async (keys) =>
			(await chrome.storage.sync.get(keys)) as Record<string, unknown>);
	const getCurrentUrl =
		dependencies.getCurrentUrl ?? (() => window.location.href);

	chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
		if (message?.type !== MESSAGE_TYPES.GET_CONTENT_DIAGNOSTICS) {
			return;
		}

		void (async () => {
			const storage = await getSync(DEV_MODE_STORAGE_KEY);
			const devModeEnabled = resolveDevMode(
				storage[DEV_MODE_STORAGE_KEY] as boolean | null | undefined,
			);
			if (!devModeEnabled) {
				const disabledResponse: ContentDiagnosticsResponse = {
					status: "disabled",
					reason: "Developer mode is disabled.",
				};
				sendResponse(disabledResponse);
				return;
			}

			const okResponse: ContentDiagnosticsResponse = {
				status: "ok",
				snapshot: platform.diagnostics.collectSnapshot(getCurrentUrl()),
			};
			sendResponse(okResponse);
		})().catch((error) => {
			const errorResponse: ContentDiagnosticsResponse = {
				status: "error",
				reason: formatErrorReason(error),
			};
			sendResponse(errorResponse);
		});

		return true;
	});
}
