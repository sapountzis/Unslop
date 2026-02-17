import type {
	ContentDiagnosticsSnapshot,
	DiagnosticCheck,
	DiagnosticStatus,
	DiagnosticsReport,
	RuntimeDiagnosticsSnapshot,
} from "../lib/diagnostics";

type BuildDiagnosticsInput = {
	runtimeSnapshot: RuntimeDiagnosticsSnapshot | null;
	runtimeDisabledReason: string | null;
	runtimeError: string | null;
	contentSnapshot: ContentDiagnosticsSnapshot | null;
	contentDisabledReason: string | null;
	contentError: string | null;
};

const STATUS_RANK: Record<DiagnosticStatus, number> = {
	fail: 0,
	warn: 1,
	pass: 2,
};

const OPEN_SUPPORTED_FEED_ACTION =
	"Open a supported feed (LinkedIn, X, or Reddit) and rerun diagnostics.";

function createCoreCheck(
	check: Omit<DiagnosticCheck, "scope">,
): DiagnosticCheck {
	return {
		...check,
		scope: "core",
	};
}

function summarizeChecks(
	checks: DiagnosticCheck[],
): DiagnosticsReport["summary"] {
	let pass = 0;
	let warn = 0;
	let fail = 0;

	for (const check of checks) {
		if (check.status === "pass") {
			pass += 1;
			continue;
		}
		if (check.status === "warn") {
			warn += 1;
			continue;
		}
		fail += 1;
	}

	return { pass, warn, fail };
}

function getOverallStatus(
	summary: DiagnosticsReport["summary"],
): DiagnosticsReport["overallStatus"] {
	if (summary.fail > 0) return "fail";
	if (summary.warn > 0) return "warn";
	return "pass";
}

function sortChecks(checks: DiagnosticCheck[]): DiagnosticCheck[] {
	return checks.sort((a, b) => {
		const rankDiff = STATUS_RANK[a.status] - STATUS_RANK[b.status];
		if (rankDiff !== 0) return rankDiff;
		if (a.scope !== b.scope) {
			return a.scope === "core" ? -1 : 1;
		}
		return a.label.localeCompare(b.label);
	});
}

function withReport(checks: DiagnosticCheck[]): DiagnosticsReport {
	const sortedChecks = sortChecks(checks);
	const summary = summarizeChecks(sortedChecks);
	return {
		generatedAtIso: new Date().toISOString(),
		overallStatus: getOverallStatus(summary),
		summary,
		checks: sortedChecks,
	};
}

export function buildDiagnosticsReport(
	input: BuildDiagnosticsInput,
): DiagnosticsReport {
	const checks: DiagnosticCheck[] = [];

	if (input.runtimeError) {
		checks.push(
			createCoreCheck({
				id: "service_worker_reachable",
				label: "Background service worker reachable",
				status: "fail",
				evidence: input.runtimeError,
				nextAction:
					"Reload extension from chrome://extensions and reopen the popup.",
			}),
		);
		return withReport(checks);
	}

	if (!input.runtimeSnapshot) {
		if (input.runtimeDisabledReason) {
			checks.push(
				createCoreCheck({
					id: "service_worker_reachable",
					label: "Background service worker reachable",
					status: "pass",
					evidence: "runtime message responded",
					nextAction: "None.",
				}),
			);
			checks.push(
				createCoreCheck({
					id: "diagnostics_gate",
					label: "Diagnostics gate",
					status: "warn",
					evidence: input.runtimeDisabledReason,
					nextAction: "Enable Developer mode and rerun diagnostics.",
				}),
			);
			return withReport(checks);
		}

		checks.push(
			createCoreCheck({
				id: "service_worker_reachable",
				label: "Background service worker reachable",
				status: "fail",
				evidence: "No diagnostics response received.",
				nextAction:
					"Reload extension from chrome://extensions and reopen the popup.",
			}),
		);
		return withReport(checks);
	}

	const runtime = input.runtimeSnapshot;
	checks.push(
		createCoreCheck({
			id: "service_worker_reachable",
			label: "Background service worker reachable",
			status: "pass",
			evidence: "runtime message responded",
			nextAction: "None.",
		}),
	);

	checks.push(
		createCoreCheck({
			id: "developer_mode_enabled",
			label: "Developer mode enabled",
			status: runtime.devModeEnabled ? "pass" : "fail",
			evidence: `dev_mode=${String(runtime.devModeEnabled)}`,
			nextAction: runtime.devModeEnabled
				? "None."
				: "Turn on Developer mode in popup settings.",
		}),
	);

	checks.push(
		createCoreCheck({
			id: "storage_enabled",
			label: "Filtering enabled toggle",
			status: runtime.enabled ? "pass" : "fail",
			evidence: `enabled=${String(runtime.enabled)}`,
			nextAction: runtime.enabled
				? "None."
				: "Turn on 'Enable filtering' in popup.",
		}),
	);

	checks.push(
		createCoreCheck({
			id: "storage_jwt_present",
			label: "JWT present",
			status: runtime.hasJwt ? "pass" : "fail",
			evidence: `jwt_present=${String(runtime.hasJwt)}`,
			nextAction: runtime.hasJwt
				? "None."
				: "Sign in and complete the auth callback flow.",
		}),
	);

	checks.push(
		createCoreCheck({
			id: "active_tab_present",
			label: "Active tab available",
			status: runtime.activeTabId === null ? "fail" : "pass",
			evidence: `active_tab_id=${runtime.activeTabId ?? "none"}`,
			nextAction:
				runtime.activeTabId === null ? OPEN_SUPPORTED_FEED_ACTION : "None.",
		}),
	);

	checks.push(
		createCoreCheck({
			id: "active_tab_supported_platform",
			label: "Active tab host is supported",
			status: runtime.supportedPlatformId === null ? "fail" : "pass",
			evidence: `host=${runtime.activeTabHost ?? "none"}, platform=${runtime.supportedPlatformId ?? "none"}`,
			nextAction:
				runtime.supportedPlatformId === null
					? OPEN_SUPPORTED_FEED_ACTION
					: "None.",
		}),
	);

	checks.push(
		createCoreCheck({
			id: "backend_reachable",
			label: "Backend endpoint reachable",
			status: runtime.backendReachable ? "pass" : "fail",
			evidence: runtime.backendReachable
				? `status=${runtime.backendHttpStatus ?? "none"}, latency_ms=${runtime.backendLatencyMs ?? "unknown"}`
				: (runtime.backendError ?? "Network probe failed."),
			nextAction: runtime.backendReachable
				? "None."
				: "Check internet access and API base URL settings.",
		}),
	);

	if (runtime.activeTabId === null || runtime.supportedPlatformId === null) {
		checks.push(
			createCoreCheck({
				id: "content_script_reachable",
				label: "Content runtime reachable",
				status: "warn",
				evidence:
					"Skipped content diagnostics because active tab is missing or unsupported.",
				nextAction: OPEN_SUPPORTED_FEED_ACTION,
			}),
		);
		return withReport(checks);
	}

	if (
		input.contentError ||
		input.contentDisabledReason ||
		!input.contentSnapshot
	) {
		checks.push(
			createCoreCheck({
				id: "content_script_reachable",
				label: "Content runtime reachable",
				status: "fail",
				evidence:
					input.contentError ??
					input.contentDisabledReason ??
					"No content diagnostics response.",
				nextAction:
					"Enable extension site access for the active platform and reload the tab.",
			}),
		);
		return withReport(checks);
	}

	checks.push(
		createCoreCheck({
			id: "content_script_reachable",
			label: "Content runtime reachable",
			status: "pass",
			evidence: `platform=${input.contentSnapshot.platformId}`,
			nextAction: "None.",
		}),
	);

	checks.push(...input.contentSnapshot.checks);
	return withReport(checks);
}
