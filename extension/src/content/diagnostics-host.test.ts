import { afterEach, describe, expect, it } from "bun:test";
import { registerContentDiagnosticsHost } from "./diagnostics-host";
import { MESSAGE_TYPES } from "../lib/messages";
import type { PlatformPlugin } from "../platforms/platform";

function waitForAsync(): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, 0));
}

const platformMock: PlatformPlugin = {
	id: "linkedin",
	selectors: {
		feed: "#feed",
		candidatePostRoot: ".post",
		renderPostRoot: ".post",
	},
	preclassifyCssSelector: ".post",
	shouldFilterRoute: () => true,
	routeKeyFromUrl: () => "/feed/",
	shouldFilterRouteKey: () => true,
	findFeedRoot: () => null,
	resolvePostSurface: () => null,
	extractPostData: async () => null,
	readPostIdentity: () => null,
	diagnostics: {
		collectSnapshot: (url) => ({
			platformId: "linkedin",
			url,
			routeKey: "/feed/",
			routeEligible: true,
			checks: [],
		}),
	},
};

describe("content diagnostics host", () => {
	afterEach(() => {
		delete (globalThis as { chrome?: unknown }).chrome;
	});

	it("returns disabled when developer mode is off", async () => {
		const listeners: Array<
			(
				message: unknown,
				sender: chrome.runtime.MessageSender,
				sendResponse: (response?: unknown) => void,
			) => boolean | void
		> = [];
		(globalThis as { chrome: unknown }).chrome = {
			runtime: {
				onMessage: {
					addListener: (
						listener: (
							message: unknown,
							sender: chrome.runtime.MessageSender,
							sendResponse: (response?: unknown) => void,
						) => boolean | void,
					) => {
						listeners.push(listener);
					},
				},
			},
			storage: {
				sync: {
					get: async () => ({ devMode: false }),
				},
			},
		} as unknown;

		registerContentDiagnosticsHost(platformMock, {
			getCurrentUrl: () => "https://www.linkedin.com/feed/",
		});
		const listener = listeners[0];
		if (!listener) throw new Error("listener not registered");

		let response: unknown = null;
		const keepChannel = listener(
			{ type: MESSAGE_TYPES.GET_CONTENT_DIAGNOSTICS },
			{} as chrome.runtime.MessageSender,
			(value) => {
				response = value;
			},
		);

		expect(keepChannel).toBe(true);
		await waitForAsync();
		expect(response).toEqual({
			status: "disabled",
			reason: "Developer mode is disabled.",
		});
	});

	it("returns platform-owned snapshot when developer mode is on", async () => {
		const listeners: Array<
			(
				message: unknown,
				sender: chrome.runtime.MessageSender,
				sendResponse: (response?: unknown) => void,
			) => boolean | void
		> = [];
		(globalThis as { chrome: unknown }).chrome = {
			runtime: {
				onMessage: {
					addListener: (
						listener: (
							message: unknown,
							sender: chrome.runtime.MessageSender,
							sendResponse: (response?: unknown) => void,
						) => boolean | void,
					) => {
						listeners.push(listener);
					},
				},
			},
			storage: {
				sync: {
					get: async () => ({ devMode: true }),
				},
			},
		} as unknown;

		registerContentDiagnosticsHost(platformMock, {
			getCurrentUrl: () => "https://www.linkedin.com/feed/",
		});
		const listener = listeners[0];
		if (!listener) throw new Error("listener not registered");

		let response: unknown = null;
		listener(
			{ type: MESSAGE_TYPES.GET_CONTENT_DIAGNOSTICS },
			{} as chrome.runtime.MessageSender,
			(value) => {
				response = value;
			},
		);

		await waitForAsync();
		expect(response).toEqual({
			status: "ok",
			snapshot: {
				platformId: "linkedin",
				url: "https://www.linkedin.com/feed/",
				routeKey: "/feed/",
				routeEligible: true,
				checks: [],
			},
		});
	});
});
