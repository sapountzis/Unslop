import { describe, expect, it, beforeEach } from "bun:test";
import { createRuntimeController } from "../content/runtime-controller";

describe("runtime controller with platform plugins", () => {
	let enterDisabledCalls: string[];
	let enterEnabledCalls: Array<{ routeKey: string; forceAttach: boolean }>;
	let currentRouteKey: string;
	let currentEnabled: boolean;
	let attachmentLiveMap: Map<string, boolean>;

	function createTestController() {
		return createRuntimeController({
			getRouteKey: () => currentRouteKey,
			isRouteEligible: (key) => {
				// Simulates feed route eligibility for multiple platforms
				if (key === "/feed/" || key.startsWith("/feed/")) return true; // LinkedIn
				if (key === "/" || key === "/home/") return true; // X
				if (key.startsWith("/r/") && !key.includes("/comments/")) return true; // Reddit
				return false;
			},
			readEnabled: async () => currentEnabled,
			enterDisabled: (routeKey) => enterDisabledCalls.push(routeKey),
			enterEnabled: (input) => enterEnabledCalls.push(input),
			isAttachmentLive: (routeKey) => attachmentLiveMap.get(routeKey) ?? false,
		});
	}

	beforeEach(() => {
		enterDisabledCalls = [];
		enterEnabledCalls = [];
		currentRouteKey = "/feed/";
		currentEnabled = true;
		attachmentLiveMap = new Map();
	});

	it("enables runtime for linkedin feed route", async () => {
		currentRouteKey = "/feed/";
		const ctrl = createTestController();
		await ctrl.reconcile("init");
		expect(ctrl.isEnabledForProcessing()).toBe(true);
		expect(enterEnabledCalls).toHaveLength(1);
		expect(enterEnabledCalls[0].routeKey).toBe("/feed/");
	});

	it("enables runtime for x home route", async () => {
		currentRouteKey = "/home/";
		const ctrl = createTestController();
		await ctrl.reconcile("init");
		expect(ctrl.isEnabledForProcessing()).toBe(true);
		expect(enterEnabledCalls[0].routeKey).toBe("/home/");
	});

	it("enables runtime for reddit subreddit route", async () => {
		currentRouteKey = "/r/programming/";
		const ctrl = createTestController();
		await ctrl.reconcile("init");
		expect(ctrl.isEnabledForProcessing()).toBe(true);
		expect(enterEnabledCalls[0].routeKey).toBe("/r/programming/");
	});

	it("disables runtime for reddit comment page", async () => {
		currentRouteKey = "/r/programming/comments/abc/post_title/";
		const ctrl = createTestController();
		await ctrl.reconcile("init");
		expect(ctrl.isEnabledForProcessing()).toBe(false);
		expect(enterEnabledCalls).toHaveLength(0);
	});

	it("disables runtime when extension is toggled off", async () => {
		const ctrl = createTestController();
		await ctrl.reconcile("init");
		expect(ctrl.isEnabledForProcessing()).toBe(true);

		currentEnabled = false;
		await ctrl.reconcile("toggle");
		expect(ctrl.isEnabledForProcessing()).toBe(false);
		expect(enterDisabledCalls.length).toBeGreaterThan(0);
	});

	it("re-enables after toggle on", async () => {
		const ctrl = createTestController();
		currentEnabled = false;
		await ctrl.reconcile("init");
		expect(ctrl.isEnabledForProcessing()).toBe(false);

		currentEnabled = true;
		await ctrl.reconcile("toggle");
		expect(ctrl.isEnabledForProcessing()).toBe(true);
	});

	it("handles route changes between platforms", async () => {
		const ctrl = createTestController();
		currentRouteKey = "/feed/";
		await ctrl.reconcile("init");
		expect(ctrl.getState().routeKey).toBe("/feed/");

		currentRouteKey = "/home/";
		await ctrl.reconcile("route");
		expect(ctrl.getState().routeKey).toBe("/home/");
		expect(ctrl.isEnabledForProcessing()).toBe(true);
	});

	it("transitions to disabled on ineligible route", async () => {
		const ctrl = createTestController();
		await ctrl.reconcile("init");
		expect(ctrl.isEnabledForProcessing()).toBe(true);

		currentRouteKey = "/settings/";
		await ctrl.reconcile("route");
		expect(ctrl.isEnabledForProcessing()).toBe(false);
	});

	it("reports correct mode when attachment is live", async () => {
		attachmentLiveMap.set("/feed/", true);
		const ctrl = createTestController();
		await ctrl.reconcile("init");
		expect(ctrl.getState().mode).toBe("enabled_active");
	});

	it("reports enabled_attaching when attachment is not live", async () => {
		const ctrl = createTestController();
		await ctrl.reconcile("init");
		expect(ctrl.getState().mode).toBe("enabled_attaching");
	});

	it("force attaches on watchdog reconcile", async () => {
		const ctrl = createTestController();
		await ctrl.reconcile("init");
		enterEnabledCalls.length = 0;

		await ctrl.reconcile("watchdog");
		expect(enterEnabledCalls).toHaveLength(1);
		expect(enterEnabledCalls[0].forceAttach).toBe(true);
	});
});
