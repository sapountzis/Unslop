import type { BackgroundDiagnosticsSnapshot } from "../lib/diagnostics";

const SUPPORTED_FEED_HOSTS = new Set([
	"www.linkedin.com",
	"x.com",
	"twitter.com",
	"www.reddit.com",
	"old.reddit.com",
]);

export function getHostname(url: string | null | undefined): string | null {
	if (!url) return null;
	try {
		return new URL(url).hostname;
	} catch {
		return null;
	}
}

export function isSupportedFeedUrl(url: string): boolean {
	const host = getHostname(url);
	return host !== null && SUPPORTED_FEED_HOSTS.has(host);
}

type BuildRuntimeDiagnosticsSnapshotInput = {
	enabled: boolean;
	hasJwt: boolean;
	activeTab: chrome.tabs.Tab | undefined;
};

export function buildRuntimeDiagnosticsSnapshot(
	input: BuildRuntimeDiagnosticsSnapshotInput,
): BackgroundDiagnosticsSnapshot {
	const activeTabUrl =
		typeof input.activeTab?.url === "string" ? input.activeTab.url : null;
	const activeTabHost = getHostname(activeTabUrl);

	return {
		enabled: input.enabled,
		hasJwt: input.hasJwt,
		activeTabId:
			typeof input.activeTab?.id === "number" ? input.activeTab.id : null,
		activeTabUrl,
		activeTabHost,
		activeTabIsLinkedIn: activeTabHost === "www.linkedin.com",
		activeTabIsSupportedFeedHost:
			activeTabUrl !== null && isSupportedFeedUrl(activeTabUrl),
	};
}
