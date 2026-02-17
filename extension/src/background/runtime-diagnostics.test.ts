import { describe, expect, it } from "bun:test";
import {
	buildRuntimeDiagnosticsSnapshot,
	getHostname,
	isSupportedFeedUrl,
} from "./runtime-diagnostics";

describe("runtime diagnostics helpers", () => {
	it("parses hostnames safely", () => {
		expect(getHostname("https://www.linkedin.com/feed/")).toBe(
			"www.linkedin.com",
		);
		expect(getHostname("not-a-url")).toBeNull();
	});

	it("matches supported feed host urls", () => {
		expect(isSupportedFeedUrl("https://www.linkedin.com/feed/")).toBe(true);
		expect(isSupportedFeedUrl("https://example.com/feed/")).toBe(false);
	});

	it("builds a runtime snapshot from auth and active-tab state", () => {
		const snapshot = buildRuntimeDiagnosticsSnapshot({
			enabled: true,
			hasJwt: true,
			activeTab: {
				id: 88,
				url: "https://www.linkedin.com/feed/",
			} as chrome.tabs.Tab,
		});

		expect(snapshot).toEqual({
			enabled: true,
			hasJwt: true,
			activeTabId: 88,
			activeTabUrl: "https://www.linkedin.com/feed/",
			activeTabHost: "www.linkedin.com",
			activeTabIsLinkedIn: true,
			activeTabIsSupportedFeedHost: true,
		});
	});
});
