import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { findLinkedInFeedRoot } from "./plugin";

describe("linkedin plugin feed root resolution", () => {
	let container: HTMLElement;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
	});

	afterEach(() => {
		container.remove();
	});

	it("returns null when route is not feed-eligible", () => {
		expect(
			findLinkedInFeedRoot("https://www.linkedin.com/notifications/"),
		).toBe(null);
	});

	it("returns document body on feed route", () => {
		expect(findLinkedInFeedRoot("https://www.linkedin.com/feed/")).toBe(
			document.body,
		);
	});

	it("returns document body on feed route with query params", () => {
		expect(
			findLinkedInFeedRoot("https://www.linkedin.com/feed/?filter=following"),
		).toBe(document.body);
	});
});
