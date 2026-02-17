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

function isValidRuntimeDiagnosticsResponse(
	response: RuntimeDiagnosticsResponse | null,
): response is RuntimeDiagnosticsResponse {
	return !!response && response.status === "ok" && !!response.snapshot;
}

function isValidContentDiagnosticsResponse(
	response: ContentDiagnosticsResponse | null,
): response is ContentDiagnosticsResponse {
	return !!response && response.status === "ok" && !!response.snapshot;
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
		let backgroundSnapshot: RuntimeDiagnosticsResponse["snapshot"] | null =
			null;
		let backgroundError: string | null = null;
		let contentSnapshot: ContentDiagnosticsResponse["snapshot"] | null = null;
		let contentError: string | null = null;

		try {
			const response = await this.requestRuntimeDiagnostics();
			if (!isValidRuntimeDiagnosticsResponse(response)) {
				throw new Error("Runtime diagnostics response was invalid.");
			}
			backgroundSnapshot = response.snapshot;
		} catch (error) {
			backgroundError = formatErrorMessage(error);
		}

		if (
			backgroundSnapshot &&
			typeof backgroundSnapshot.activeTabId === "number"
		) {
			try {
				const response = await this.requestContentDiagnostics(
					backgroundSnapshot.activeTabId,
				);
				if (!isValidContentDiagnosticsResponse(response)) {
					throw new Error("Content diagnostics response was invalid.");
				}
				contentSnapshot = response.snapshot;
			} catch (error) {
				contentError = formatErrorMessage(error);
			}
		} else if (backgroundSnapshot) {
			contentError = "No active tab found.";
		}

		return this.buildDiagnosticsReportFn({
			backgroundSnapshot,
			backgroundError,
			contentSnapshot,
			contentError,
		});
	}
}
