import { describe, expect, it } from "bun:test";
import {
	extractPostData,
	readPostIdentity,
	isLikelyFeedPostRoot,
} from "./parser";

function makeElement(
	overrides: Partial<{
		matches: (s: string) => boolean;
		querySelector: (s: string) => any;
		querySelectorAll: (s: string) => any[];
		getAttribute: (s: string) => string | null;
		classList: { contains: (s: string) => boolean };
		textContent: string;
	}> = {},
): HTMLElement {
	return {
		matches: overrides.matches ?? (() => false),
		querySelector: overrides.querySelector ?? (() => null),
		querySelectorAll: overrides.querySelectorAll ?? (() => []),
		getAttribute: overrides.getAttribute ?? (() => null),
		classList: overrides.classList ?? { contains: () => false },
		closest: () => null,
		textContent: overrides.textContent ?? "",
	} as unknown as HTMLElement;
}

describe("linkedin parser", () => {
	describe("isLikelyFeedPostRoot", () => {
		it("rejects elements without article role or URN", () => {
			const el = makeElement({
				getAttribute: () => null,
				querySelector: () => null,
			});
			expect(isLikelyFeedPostRoot(el)).toBe(false);
		});

		it("rejects aggregate URNs", () => {
			const el = makeElement({
				getAttribute: (name) =>
					name === "role"
						? "article"
						: name === "data-urn"
							? "urn:li:aggregate:123"
							: null,
			});
			expect(isLikelyFeedPostRoot(el)).toBe(false);
		});

		it("rejects elements with recommendation entities", () => {
			const el = makeElement({
				getAttribute: (name) =>
					name === "role"
						? "article"
						: name === "data-urn"
							? "urn:li:activity:123"
							: null,
				querySelector: (s) =>
					s === '[data-urn^="urn:li:aggregate:"]' ? {} : null,
			});
			expect(isLikelyFeedPostRoot(el)).toBe(false);
		});

		it("accepts valid feed post with URN", () => {
			const el = makeElement({
				matches: (s) =>
					s.includes("urn:li:activity:") || s.includes("urn:li:share:"),
				getAttribute: (name) =>
					name === "data-urn" ? "urn:li:activity:123" : null,
				querySelector: () => null,
			});
			expect(isLikelyFeedPostRoot(el)).toBe(true);
		});
	});

	describe("readPostIdentity", () => {
		it("reads data-id attribute", () => {
			const el = makeElement({
				getAttribute: (name) => (name === "data-id" ? "post-123" : null),
			});
			expect(readPostIdentity(el)).toBe("post-123");
		});

		it("falls back to data-urn", () => {
			const el = makeElement({
				getAttribute: (name) =>
					name === "data-urn" ? "urn:li:activity:456" : null,
			});
			expect(readPostIdentity(el)).toBe("urn:li:activity:456");
		});

		it("falls back to nested URN element", () => {
			const el = makeElement({
				getAttribute: () => null,
				querySelector: () => ({
					getAttribute: (name: string) =>
						name === "data-urn" ? "urn:li:share:789" : null,
				}),
			});
			expect(readPostIdentity(el)).toBe("urn:li:share:789");
		});

		it("returns null when no identity found", () => {
			const el = makeElement();
			expect(readPostIdentity(el)).toBeNull();
		});
	});

	describe("extractPostData", () => {
		it("returns null for non-post elements", async () => {
			const el = makeElement();
			expect(await extractPostData(el)).toBeNull();
		});

		it("removes known linkedin feed UI noise from extracted text", async () => {
			const el = makeElement({
				matches: (s) =>
					s.includes("urn:li:activity:") || s.includes("urn:li:share:"),
				getAttribute: (name) =>
					name === "data-urn" ? "urn:li:activity:noise1" : null,
				textContent:
					"Feed post number 28 Serg Masis loves this Real post body here. 33 reactions 13 comments Like Comment Repost Send",
				querySelector: () => null,
				querySelectorAll: () => [],
			});

			const result = await extractPostData(el);
			expect(result).not.toBeNull();
			expect(result!.text).toBe("real post body here.");
		});

		it("applies metadata-heavy linkedin cleanup before returning text", async () => {
			const el = makeElement({
				matches: (s) =>
					s.includes("urn:li:activity:") || s.includes("urn:li:share:"),
				getAttribute: (name) =>
					name === "data-urn" ? "urn:li:activity:noise-v2" : null,
				textContent:
					"simon heatonsimon heaton • followingverified • following director of growth marketing @ buffer director of growth marketing @ buffer 1w • 1 week ago • visible to anyone on or off linkedin we're hiring a senior data scientist at buffer! ...more 144 19 comments 11 reposts",
				querySelector: () => null,
				querySelectorAll: () => [],
			});

			const result = await extractPostData(el);
			expect(result).not.toBeNull();
			expect(result!.text).toBe(
				"we're hiring a senior data scientist at buffer!",
			);
		});

		it("strips connection-follow metadata prefixes in extracted text", async () => {
			const el = makeElement({
				matches: (s) =>
					s.includes("urn:li:activity:") || s.includes("urn:li:share:"),
				getAttribute: (name) =>
					name === "data-urn" ? "urn:li:activity:connectionsfollow1" : null,
				textContent:
					"George Spanidis, Nektaria Toto and 51 other connections follow LinkedIn for Marketing this is the real post body",
				querySelector: () => null,
				querySelectorAll: () => [],
			});

			const result = await extractPostData(el);
			expect(result).not.toBeNull();
			expect(result!.text).toBe("this is the real post body");
		});

		it("falls back to raw normalized text if cleanup strips everything", async () => {
			const el = makeElement({
				matches: (s) =>
					s.includes("urn:li:activity:") || s.includes("urn:li:share:"),
				getAttribute: (name) =>
					name === "data-urn" ? "urn:li:activity:fallback1" : null,
				textContent: "Feed post number 15 Coursera commented on this",
				querySelector: () => null,
				querySelectorAll: () => [],
			});

			const result = await extractPostData(el);
			expect(result).not.toBeNull();
			expect(result!.text).toBe(
				"feed post number 15 coursera commented on this",
			);
		});

		it("extracts basic post with text content", async () => {
			const el = makeElement({
				matches: (s) =>
					s.includes("urn:li:activity:") || s.includes("urn:li:share:"),
				getAttribute: (name) =>
					name === "data-urn" ? "urn:li:activity:test123" : null,
				textContent: "  My LinkedIn post content.  ",
				querySelector: (s) => {
					if (
						s.includes("feed-shared-text") ||
						s.includes("feed-shared-update-v2__description")
					) {
						return {
							textContent: "  My LinkedIn post content.  ",
							closest: () => null,
						};
					}
					if (
						s.includes('a[href*="/in/"]') ||
						s.includes('a[href*="/company/"]')
					) {
						return {
							getAttribute: (name: string) =>
								name === "href" ? "/in/johndoe/" : null,
							textContent: null,
						};
					}
					if (
						s.includes("actor__title") ||
						s.includes("visually-hidden") ||
						s.includes("anonymize")
					) {
						return { textContent: "John Doe" };
					}
					if (s.includes("data-urn")) {
						return {
							getAttribute: (name: string) =>
								name === "data-urn" ? "urn:li:activity:test123" : null,
						};
					}
					return null;
				},
				querySelectorAll: () => [],
			});

			const result = await extractPostData(el);
			expect(result).not.toBeNull();
			expect(result!.post_id).toBe("urn:li:activity:test123");
			expect(result!.text).toBe("my linkedin post content.");
		});

		it("handles company author URLs", async () => {
			const el = makeElement({
				matches: (s) =>
					s.includes("urn:li:activity:") || s.includes("urn:li:share:"),
				getAttribute: (name) =>
					name === "data-urn" ? "urn:li:activity:comp1" : null,
				textContent: "Company post",
				querySelector: (s) => {
					if (
						s.includes("feed-shared-text") ||
						s.includes("feed-shared-update-v2__description")
					) {
						return { textContent: "Company post", closest: () => null };
					}
					if (
						s.includes('a[href*="/in/"]') ||
						s.includes('a[href*="/company/"]')
					) {
						return {
							getAttribute: (name: string) =>
								name === "href" ? "/company/acme-corp/" : null,
							textContent: null,
						};
					}
					if (s.includes("data-urn")) {
						return {
							getAttribute: (name: string) =>
								name === "data-urn" ? "urn:li:activity:comp1" : null,
						};
					}
					return null;
				},
				querySelectorAll: () => [],
			});

			const result = await extractPostData(el);
			expect(result).not.toBeNull();
			expect(result!.post_id).toBe("urn:li:activity:comp1");
			expect(result!.text).toBe("company post");
		});
	});
});
