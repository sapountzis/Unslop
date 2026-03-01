export type DiagnosticStatus = "pass" | "warn" | "fail";
export type DiagnosticScope = "core" | "platform";
export type SupportedPlatformId = "linkedin" | "x" | "reddit";

export type DiagnosticCheckId = string;

export type RuntimeDiagnosticsSnapshot = {
	devModeEnabled: boolean;
	enabled: boolean;
	hasApiKey: boolean;
	activeTabId: number | null;
	activeTabUrl: string | null;
	activeTabHost: string | null;
	supportedPlatformId: SupportedPlatformId | null;
	llmEndpointReachable: boolean;
	llmEndpointLatencyMs: number | null;
	llmEndpointHttpStatus: number | null;
	llmEndpointError: string | null;
};

export type ContentDiagnosticsSnapshot = {
	platformId: SupportedPlatformId;
	url: string;
	routeKey: string;
	routeEligible: boolean;
	checks: DiagnosticCheck[];
};

export type RuntimeDiagnosticsResponse = {
	status: "ok" | "disabled" | "error";
	snapshot?: RuntimeDiagnosticsSnapshot;
	reason?: string;
};

export type ContentDiagnosticsResponse = {
	status: "ok" | "disabled" | "error";
	snapshot?: ContentDiagnosticsSnapshot;
	reason?: string;
};

export type DiagnosticCheck = {
	id: DiagnosticCheckId;
	scope: DiagnosticScope;
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
