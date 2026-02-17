import { MESSAGE_TYPES } from "../lib/messages";
import type {
	ContentDiagnosticsResponse,
	DiagnosticsReport,
	RuntimeDiagnosticsResponse,
} from "../lib/diagnostics";
import { buildDiagnosticsReport } from "./diagnostics";

type DiagnosticsClientDependencies = {
	requestRuntimeDiagnostics?: () => Promise<RuntimeDiagnosticsResponse | null>;
	requestContentDiagnostics?: (
		tabId: number,
	) => Promise<ContentDiagnosticsResponse | null>;
	buildDiagnosticsReportFn?: typeof buildDiagnosticsReport;
};

function formatErrorMessage(error: unknown): string {
	if (error instanceof Error) {
		return error.message || "Unknown error";
	}
	if (typeof error === "string") {
		return error;
	}
	return "Unknown error";
}

function isValidDiagnosticsResponse(
	response: RuntimeDiagnosticsResponse | ContentDiagnosticsResponse | null,
): response is RuntimeDiagnosticsResponse | ContentDiagnosticsResponse {
	return (
		!!response &&
		(response.status === "ok" ||
			response.status === "disabled" ||
			response.status === "error")
	);
}

export class DiagnosticsClient {
	private readonly requestRuntimeDiagnostics: NonNullable<
		DiagnosticsClientDependencies["requestRuntimeDiagnostics"]
	>;
	private readonly requestContentDiagnostics: NonNullable<
		DiagnosticsClientDependencies["requestContentDiagnostics"]
	>;
	private readonly buildDiagnosticsReportFn: NonNullable<
		DiagnosticsClientDependencies["buildDiagnosticsReportFn"]
	>;

	constructor(dependencies: DiagnosticsClientDependencies = {}) {
		this.requestRuntimeDiagnostics =
			dependencies.requestRuntimeDiagnostics ??
			(async () =>
				(await chrome.runtime.sendMessage({
					type: MESSAGE_TYPES.GET_RUNTIME_DIAGNOSTICS,
				})) as RuntimeDiagnosticsResponse | null);
		this.requestContentDiagnostics =
			dependencies.requestContentDiagnostics ??
			(async (tabId) =>
				(await chrome.tabs.sendMessage(tabId, {
					type: MESSAGE_TYPES.GET_CONTENT_DIAGNOSTICS,
				})) as ContentDiagnosticsResponse | null);
		this.buildDiagnosticsReportFn =
			dependencies.buildDiagnosticsReportFn ?? buildDiagnosticsReport;
	}

	async run(): Promise<DiagnosticsReport> {
		let runtimeSnapshot: RuntimeDiagnosticsResponse["snapshot"] | null = null;
		let runtimeDisabledReason: string | null = null;
		let runtimeError: string | null = null;
		let contentSnapshot: ContentDiagnosticsResponse["snapshot"] | null = null;
		let contentDisabledReason: string | null = null;
		let contentError: string | null = null;

		try {
			const response = await this.requestRuntimeDiagnostics();
			if (!isValidDiagnosticsResponse(response)) {
				throw new Error("Runtime diagnostics response was invalid.");
			}
			if (response.status === "ok") {
				runtimeSnapshot = response.snapshot ?? null;
				if (!runtimeSnapshot) {
					throw new Error("Runtime diagnostics snapshot was missing.");
				}
			} else if (response.status === "disabled") {
				runtimeDisabledReason =
					response.reason ?? "Developer mode is disabled.";
			} else {
				runtimeError = response.reason ?? "Runtime diagnostics failed.";
			}
		} catch (error) {
			runtimeError = formatErrorMessage(error);
		}

		if (
			runtimeSnapshot &&
			runtimeSnapshot.supportedPlatformId !== null &&
			typeof runtimeSnapshot.activeTabId === "number"
		) {
			try {
				const response = await this.requestContentDiagnostics(
					runtimeSnapshot.activeTabId,
				);
				if (!isValidDiagnosticsResponse(response)) {
					throw new Error("Content diagnostics response was invalid.");
				}

				if (response.status === "ok") {
					contentSnapshot = response.snapshot ?? null;
					if (!contentSnapshot) {
						throw new Error("Content diagnostics snapshot was missing.");
					}
				} else if (response.status === "disabled") {
					contentDisabledReason =
						response.reason ?? "Developer mode is disabled.";
				} else {
					contentError = response.reason ?? "Content diagnostics failed.";
				}
			} catch (error) {
				contentError = formatErrorMessage(error);
			}
		}

		return this.buildDiagnosticsReportFn({
			runtimeSnapshot,
			runtimeDisabledReason,
			runtimeError,
			contentSnapshot,
			contentDisabledReason,
			contentError,
		});
	}
}
