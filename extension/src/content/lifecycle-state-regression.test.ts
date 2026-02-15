import { describe, expect, it } from "bun:test";
import { createRuntimeController } from "./runtime-controller";

describe("lifecycle state regression", () => {
	it("toggle off then on on the same feed route detaches before reattach", async () => {
		let enabled = true;
		const events: string[] = [];

		const controller = createRuntimeController({
			getRouteKey: () => "/feed/",
			isRouteEligible: (routeKey) => routeKey.startsWith("/feed/"),
			readEnabled: async () => enabled,
			enterDisabled: (routeKey) => {
				events.push(`disabled:${routeKey}`);
			},
			enterEnabled: ({ routeKey }) => {
				events.push(`enabled:${routeKey}`);
			},
			isAttachmentLive: () => true,
		});

		await controller.reconcile("init");
		enabled = false;
		await controller.reconcile("toggle");
		enabled = true;
		await controller.reconcile("toggle");
		await controller.reconcile("route");

		expect(events).toEqual([
			"enabled:/feed/",
			"disabled:/feed/",
			"enabled:/feed/",
		]);
		expect(controller.getState().mode).toBe("enabled_active");
	});

	it("notifications route transition back to feed re-enables once and then stays stable", async () => {
		let route = "/feed/";
		const events: string[] = [];

		const controller = createRuntimeController({
			getRouteKey: () => route,
			isRouteEligible: (routeKey) => routeKey.startsWith("/feed/"),
			readEnabled: async () => true,
			enterDisabled: (routeKey) => {
				events.push(`disabled:${routeKey}`);
			},
			enterEnabled: ({ routeKey }) => {
				events.push(`enabled:${routeKey}`);
			},
			isAttachmentLive: () => true,
		});

		await controller.reconcile("init");
		route = "/notifications/";
		await controller.reconcile("route");
		route = "/feed/";
		await controller.reconcile("route");
		await controller.reconcile("route");

		expect(events).toEqual([
			"enabled:/feed/",
			"disabled:/notifications/",
			"enabled:/feed/",
		]);
	});
});
