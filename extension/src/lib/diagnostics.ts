export type RuntimeMode = "disabled" | "enabled_attaching" | "enabled_active";

export type DiagnosticStatus = "pass" | "warn" | "fail";

export type DiagnosticCheckId =
	| "service_worker_reachable"
	| "storage_enabled"
	| "storage_jwt_present"
	| "active_tab_linkedin"
	| "eligible_feed_route"
	| "content_ping"
	| "content_script_loaded"
	| "feed_root_found"
	| "candidate_posts_found"
	| "post_identity_ready"
	| "runtime_processing_enabled"
	| "observer_live"
	| "runtime_markers_progress";

export type BackgroundDiagnosticsSnapshot = {
	enabled: boolean;
	hasJwt: boolean;
	activeTabId: number | null;
	activeTabUrl: string | null;
	activeTabHost: string | null;
	activeTabIsLinkedIn: boolean;
	activeTabIsSupportedFeedHost: boolean;
};

export type ContentDiagnosticsSnapshot = {
	platformId: string;
	url: string;
	routeKey: string;
	routeEligible: boolean;
	preclassifyEnabled: boolean;
	feedRootFound: boolean;
	candidatePostCount: number;
	identityReadyCount: number;
	processingCount: number;
	processedCount: number;
	runtimeMode: RuntimeMode;
	runtimeEnabledForProcessing: boolean;
	observerLive: boolean;
	pendingBatchCount: number;
};

export type RuntimeDiagnosticsResponse = {
	status: "ok";
	snapshot: BackgroundDiagnosticsSnapshot;
};

export type ContentDiagnosticsResponse = {
	status: "ok";
	snapshot: ContentDiagnosticsSnapshot;
};

export type DiagnosticCheck = {
	id: DiagnosticCheckId;
	label: string;
	status: DiagnosticStatus;
	evidence: string;
	nextAction: string;
};

export type DiagnosticsReport = {
	generatedAtIso: string;
	overallStatus: DiagnosticStatus;
	summary: {
		pass: number;
		warn: number;
		fail: number;
	};
	checks: DiagnosticCheck[];
};
