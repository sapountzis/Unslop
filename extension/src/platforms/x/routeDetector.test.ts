import { describe, expect, it } from "bun:test";
import { routeKeyFromUrl, shouldFilterRouteKey } from "./routeDetector";

describe("x route detector", () => {
	describe("routeKeyFromUrl", () => {
		it("normalizes home route", () => {
			expect(routeKeyFromUrl("https://x.com/home")).toBe("/home/");
		});

		it("normalizes home with trailing slash", () => {
			expect(routeKeyFromUrl("https://x.com/home/")).toBe("/home/");
		});

		it("normalizes root to /", () => {
			expect(routeKeyFromUrl("https://x.com/")).toBe("/");
		});

		it("normalizes search route", () => {
			expect(routeKeyFromUrl("https://x.com/search?q=test")).toBe("/search/");
		});

		it("returns / for invalid URL", () => {
			expect(routeKeyFromUrl("not-a-url")).toBe("/");
		});

		it("handles twitter.com domain", () => {
			expect(routeKeyFromUrl("https://twitter.com/home")).toBe("/home/");
		});
	});

	describe("shouldFilterRouteKey", () => {
		it("accepts /home/", () => {
			expect(shouldFilterRouteKey("/home/")).toBe(true);
		});

		it("accepts root /", () => {
			expect(shouldFilterRouteKey("/")).toBe(true);
		});

		it("rejects profile pages", () => {
			expect(shouldFilterRouteKey("/elonmusk/")).toBe(false);
		});

		it("rejects settings", () => {
			expect(shouldFilterRouteKey("/settings/")).toBe(false);
		});

		it("rejects messages", () => {
			expect(shouldFilterRouteKey("/messages/")).toBe(false);
		});

		it("rejects notifications", () => {
			expect(shouldFilterRouteKey("/notifications/")).toBe(false);
		});

		it("rejects search", () => {
			expect(shouldFilterRouteKey("/search/")).toBe(false);
		});

		it("accepts explore", () => {
			expect(shouldFilterRouteKey("/explore/")).toBe(true);
		});
	});
});
