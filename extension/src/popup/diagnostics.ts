import type {
	BackgroundDiagnosticsSnapshot,
	ContentDiagnosticsSnapshot,
	DiagnosticCheck,
	DiagnosticStatus,
	DiagnosticsReport,
} from "../lib/diagnostics";

type BuildDiagnosticsInput = {
	backgroundSnapshot: BackgroundDiagnosticsSnapshot | null;
	backgroundError: string | null;
	contentSnapshot: ContentDiagnosticsSnapshot | null;
	contentError: string | null;
};

const STATUS_RANK: Record<DiagnosticStatus, number> = {
	fail: 0,
	warn: 1,
	pass: 2,
};

const OPEN_LINKEDIN_FEED_ACTION =
	"Open https://www.linkedin.com/feed/ and run diagnostics again.";

function createCheck(check: DiagnosticCheck): DiagnosticCheck {
	return check;
}

function readRoutePath(url: string | null): string | null {
	if (!url) return null;
	try {
		return new URL(url).pathname;
	} catch {
		return null;
	}
}

function isEligibleLinkedInFeedRoute(pathname: string | null): boolean {
	if (!pathname) return false;
	return pathname === "/feed/" || pathname.startsWith("/feed/");
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

export function buildDiagnosticsReport(
	input: BuildDiagnosticsInput,
): DiagnosticsReport {
	const checks: DiagnosticCheck[] = [];

	if (input.backgroundError || !input.backgroundSnapshot) {
		checks.push(
			createCheck({
				id: "service_worker_reachable",
				label: "Background service worker reachable",
				status: "fail",
				evidence: input.backgroundError ?? "No diagnostics response received",
				nextAction:
					"Reload extension from chrome://extensions and re-open the popup.",
			}),
		);

		const summary = summarizeChecks(checks);
		return {
			generatedAtIso: new Date().toISOString(),
			summary,
			overallStatus: getOverallStatus(summary),
			checks,
		};
	}

	const background = input.backgroundSnapshot;
	const routePath = readRoutePath(background.activeTabUrl);

	checks.push(
		createCheck({
			id: "service_worker_reachable",
			label: "Background service worker reachable",
			status: "pass",
			evidence: "runtime message responded",
			nextAction: "None.",
		}),
	);

	checks.push(
		createCheck({
			id: "storage_enabled",
			label: "Filtering enabled toggle",
			status: background.enabled ? "pass" : "fail",
			evidence: `enabled=${String(background.enabled)}`,
			nextAction: background.enabled
				? "None."
				: "Turn on 'Enable filtering' in popup.",
		}),
	);

	checks.push(
		createCheck({
			id: "storage_jwt_present",
			label: "JWT present",
			status: background.hasJwt ? "pass" : "fail",
			evidence: `jwt_present=${String(background.hasJwt)}`,
			nextAction: background.hasJwt
				? "None."
				: "Sign in again and finish auth callback.",
		}),
	);

	checks.push(
		createCheck({
			id: "active_tab_linkedin",
			label: "Active tab is LinkedIn",
			status: background.activeTabIsLinkedIn ? "pass" : "fail",
			evidence: `host=${background.activeTabHost ?? "none"}`,
			nextAction: background.activeTabIsLinkedIn
				? "None."
				: OPEN_LINKEDIN_FEED_ACTION,
		}),
	);

	checks.push(
		createCheck({
			id: "eligible_feed_route",
			label: "LinkedIn feed route eligible",
			status: isEligibleLinkedInFeedRoute(routePath) ? "pass" : "fail",
			evidence: `path=${routePath ?? "unknown"}`,
			nextAction: isEligibleLinkedInFeedRoute(routePath)
				? "None."
				: OPEN_LINKEDIN_FEED_ACTION,
		}),
	);

	if (input.contentError || !input.contentSnapshot) {
		checks.push(
			createCheck({
				id: "content_ping",
				label: "Content runtime reachable",
				status: "fail",
				evidence: input.contentError ?? "No content diagnostics response",
				nextAction:
					"Enable extension site access for LinkedIn and reload the feed tab.",
			}),
		);

		const sortedChecks = checks.sort((a, b) => {
			const rankDiff = STATUS_RANK[a.status] - STATUS_RANK[b.status];
			if (rankDiff !== 0) return rankDiff;
			return a.label.localeCompare(b.label);
		});
		const summary = summarizeChecks(sortedChecks);
		return {
			generatedAtIso: new Date().toISOString(),
			summary,
			overallStatus: getOverallStatus(summary),
			checks: sortedChecks,
		};
	}

	const content = input.contentSnapshot;

	checks.push(
		createCheck({
			id: "content_ping",
			label: "Content runtime reachable",
			status: "pass",
			evidence: `platform=${content.platformId}`,
			nextAction: "None.",
		}),
	);

	checks.push(
		createCheck({
			id: "content_script_loaded",
			label: "Content script loaded in page",
			status: content.preclassifyEnabled ? "pass" : "fail",
			evidence: `preclassify=${String(content.preclassifyEnabled)}`,
			nextAction: content.preclassifyEnabled
				? "None."
				: "Reload the LinkedIn tab and ensure extension site access is enabled.",
		}),
	);

	checks.push(
		createCheck({
			id: "feed_root_found",
			label: "Feed root selector resolves",
			status: content.feedRootFound ? "pass" : "fail",
			evidence: `feed_root_found=${String(content.feedRootFound)}`,
			nextAction: content.feedRootFound
				? "None."
				: "Wait for feed to load fully, then rerun diagnostics.",
		}),
	);

	checks.push(
		createCheck({
			id: "candidate_posts_found",
			label: "Candidate posts detected",
			status: content.candidatePostCount > 0 ? "pass" : "fail",
			evidence: `candidate_posts=${content.candidatePostCount}`,
			nextAction:
				content.candidatePostCount > 0
					? "None."
					: "Scroll feed once and rerun diagnostics.",
		}),
	);

	checks.push(
		createCheck({
			id: "post_identity_ready",
			label: "Post identity extraction",
			status:
				content.candidatePostCount === 0
					? "warn"
					: content.identityReadyCount > 0
						? "pass"
						: "fail",
			evidence: `identity_ready=${content.identityReadyCount}/${content.candidatePostCount}`,
			nextAction:
				content.candidatePostCount === 0
					? "Run diagnostics after feed posts are visible."
					: content.identityReadyCount > 0
						? "None."
						: "LinkedIn DOM changed; compare selectors with current feed DOM.",
		}),
	);

	checks.push(
		createCheck({
			id: "runtime_processing_enabled",
			label: "Runtime enabled for processing",
			status: content.runtimeEnabledForProcessing ? "pass" : "fail",
			evidence: `runtime_mode=${content.runtimeMode}`,
			nextAction: content.runtimeEnabledForProcessing
				? "None."
				: "Verify enabled toggle and feed route eligibility.",
		}),
	);

	checks.push(
		createCheck({
			id: "observer_live",
			label: "Feed observer is live",
			status: content.observerLive ? "pass" : "warn",
			evidence: `observer_live=${String(content.observerLive)}`,
			nextAction: content.observerLive
				? "None."
				: "Reload LinkedIn feed to reattach observers.",
		}),
	);

	const markerProgressCount = content.processingCount + content.processedCount;
	checks.push(
		createCheck({
			id: "runtime_markers_progress",
			label: "Runtime marker progress",
			status: markerProgressCount > 0 ? "pass" : "warn",
			evidence: `processed=${content.processedCount}, checking=${content.processingCount}, pending_batch=${content.pendingBatchCount}`,
			nextAction:
				markerProgressCount > 0
					? "None."
					: "Scroll feed and rerun. If still zero, inspect content runtime logs.",
		}),
	);

	const sortedChecks = checks.sort((a, b) => {
		const rankDiff = STATUS_RANK[a.status] - STATUS_RANK[b.status];
		if (rankDiff !== 0) return rankDiff;
		return a.label.localeCompare(b.label);
	});
	const summary = summarizeChecks(sortedChecks);
	return {
		generatedAtIso: new Date().toISOString(),
		summary,
		overallStatus: getOverallStatus(summary),
		checks: sortedChecks,
	};
}
