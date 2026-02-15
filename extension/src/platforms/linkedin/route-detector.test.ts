import { describe, expect, it } from "bun:test";
import {
	routeKeyFromUrl,
	shouldFilterRoute,
	shouldFilterRouteKey,
} from "./route-detector";

describe("linkedin route detector", () => {
	describe("routeKeyFromUrl", () => {
		it("normalizes feed route with query params", () => {
			expect(routeKeyFromUrl("https://www.linkedin.com/feed/?x=1")).toBe(
				"/feed/",
			);
		});

		it("normalizes route without trailing slash", () => {
			expect(routeKeyFromUrl("https://www.linkedin.com/feed")).toBe("/feed/");
		});

		it("returns root for invalid URL", () => {
			expect(routeKeyFromUrl("not-a-url")).toBe("/");
		});

		it("normalizes nested feed route", () => {
			expect(
				routeKeyFromUrl("https://www.linkedin.com/feed/hashtag/typescript"),
			).toBe("/feed/hashtag/typescript/");
		});
	});

	describe("shouldFilterRouteKey", () => {
		it("accepts /feed/", () => {
			expect(shouldFilterRouteKey("/feed/")).toBe(true);
		});

		it("accepts sub-routes of /feed/", () => {
			expect(shouldFilterRouteKey("/feed/hashtag/typescript/")).toBe(true);
		});

		it("rejects /notifications/", () => {
			expect(shouldFilterRouteKey("/notifications/")).toBe(false);
		});

		it("rejects /messaging/", () => {
			expect(shouldFilterRouteKey("/messaging/")).toBe(false);
		});

		it("rejects root /", () => {
			expect(shouldFilterRouteKey("/")).toBe(false);
		});
	});

	describe("shouldFilterRoute", () => {
		it("accepts linkedin feed URLs", () => {
			expect(shouldFilterRoute("https://www.linkedin.com/feed/")).toBe(true);
		});

		it("rejects non-feed linkedin URLs", () => {
			expect(shouldFilterRoute("https://www.linkedin.com/notifications/")).toBe(
				false,
			);
		});
	});
});
