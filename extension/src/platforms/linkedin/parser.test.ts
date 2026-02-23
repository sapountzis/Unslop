import { describe, expect, it } from "bun:test";
import {
	extractPostData,
	isLikelyFeedPostRoot,
	readPostIdentity,
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

		it("strips leaked follow action prefix from extracted text", async () => {
			const el = makeElement({
				matches: (s) =>
					s.includes("urn:li:activity:") || s.includes("urn:li:share:"),
				getAttribute: (name) =>
					name === "data-urn" ? "urn:li:activity:follow-prefix-1" : null,
				textContent: "follow lazy engineers are good engineers",
				querySelector: () => null,
				querySelectorAll: () => [],
			});

			const result = await extractPostData(el);
			expect(result).not.toBeNull();
			expect(result!.text).toBe("lazy engineers are good engineers");
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

		it("drops metadata-only follows activity text", async () => {
			const el = makeElement({
				matches: (s) =>
					s.includes("urn:li:activity:") || s.includes("urn:li:share:"),
				getAttribute: (name) =>
					name === "data-urn" ? "urn:li:activity:metadata-only-follows" : null,
				textContent:
					"Anna Christina Kyratzoglou follows FranklinCovey Greece and Cyprus",
				querySelector: () => null,
				querySelectorAll: () => [],
			});

			const result = await extractPostData(el);
			expect(result).toBeNull();
		});

		it("drops metadata-only engagement headers", async () => {
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
			expect(result).toBeNull();
		});

		it("falls back to normalized text for uncertain cleanup results", async () => {
			const rawText =
				"status ok like comment congratulations! excited for you well deserved wishing you the best";
			const el = makeElement({
				matches: (s) =>
					s.includes("urn:li:activity:") || s.includes("urn:li:share:"),
				getAttribute: (name) =>
					name === "data-urn" ? "urn:li:activity:uncertain-fallback1" : null,
				textContent: rawText,
				querySelector: () => null,
				querySelectorAll: () => [],
			});

			const result = await extractPostData(el);
			expect(result).not.toBeNull();
			expect(result!.text).toBe(rawText);
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

		it("extracts main feed image and ignores small avatar images", async () => {
			const post = document.createElement("div");
			post.setAttribute("role", "article");
			post.setAttribute("data-urn", "urn:li:activity:images1");

			const text = document.createElement("p");
			text.textContent = "Main media test post";
			post.appendChild(text);

			const avatar = document.createElement("img");
			avatar.setAttribute(
				"src",
				"https://media.licdn.com/dms/image/v2/D4D03AQ/profile-displayphoto-scale_100_100/B4DZabc",
			);
			avatar.setAttribute("width", "48");
			avatar.setAttribute("height", "48");
			post.appendChild(avatar);

			const contentImage = document.createElement("img");
			contentImage.setAttribute(
				"src",
				"https://media.licdn.com/dms/image/v2/D4D22AQFARKzcgiC7Cg/feedshare-shrink_800/B56Zx7OytOGoAg-/0/1771594001502",
			);
			contentImage.setAttribute("width", "600");
			contentImage.setAttribute("height", "600");
			contentImage.setAttribute("alt", "diagram");
			post.appendChild(contentImage);

			const result = await extractPostData(post);
			expect(result).not.toBeNull();
			expect(result!.attachments).toEqual([
				{
					kind: "image",
					src: "https://media.licdn.com/dms/image/v2/D4D22AQFARKzcgiC7Cg/feedshare-shrink_800/B56Zx7OytOGoAg-/0/1771594001502",
					alt: "diagram",
					ordinal: 0,
				},
			]);
		});

		it("waits for main image src hydration before finalizing attachments", async () => {
			const post = document.createElement("div");
			post.setAttribute("role", "article");
			post.setAttribute("data-urn", "urn:li:activity:images2");

			const text = document.createElement("p");
			text.textContent = "Hydration test post";
			post.appendChild(text);

			const delayedImage = document.createElement("img");
			delayedImage.setAttribute("width", "600");
			delayedImage.setAttribute("height", "600");
			post.appendChild(delayedImage);

			const hydratedSrc =
				"https://media.licdn.com/dms/image/v2/D5622AQFARKzcgiC7Cg/feedshare-shrink_800/B56Zx7OytOGoAg-/0/1771594001502";
			setTimeout(() => {
				delayedImage.setAttribute("src", hydratedSrc);
			}, 25);

			const result = await extractPostData(post);
			expect(result).not.toBeNull();
			expect(result!.attachments).toEqual([
				{
					kind: "image",
					src: hydratedSrc,
					alt: "",
					ordinal: 0,
				},
			]);
		});

		it("uses srcset when src is empty", async () => {
			const post = document.createElement("div");
			post.setAttribute("role", "article");
			post.setAttribute("data-urn", "urn:li:activity:images3");

			const text = document.createElement("p");
			text.textContent = "Srcset test post";
			post.appendChild(text);

			const contentImage = document.createElement("img");
			contentImage.setAttribute("width", "600");
			contentImage.setAttribute("height", "600");
			contentImage.setAttribute(
				"srcset",
				"https://media.licdn.com/dms/image/v2/D4D22AQ/feedshare-shrink_800/A 800w, https://media.licdn.com/dms/image/v2/D4D22AQ/feedshare-shrink_200/B 200w",
			);
			post.appendChild(contentImage);

			const result = await extractPostData(post);
			expect(result).not.toBeNull();
			expect(result!.attachments).toEqual([
				{
					kind: "image",
					src: "https://media.licdn.com/dms/image/v2/D4D22AQ/feedshare-shrink_800/A",
					alt: "",
					ordinal: 0,
				},
			]);
		});

		it("does not include tiny ui images as attachments", async () => {
			const post = document.createElement("div");
			post.setAttribute("role", "article");
			post.setAttribute("data-urn", "urn:li:activity:images4");

			const text = document.createElement("p");
			text.textContent = "Tiny-only post";
			post.appendChild(text);

			const icon = document.createElement("img");
			icon.setAttribute(
				"src",
				"https://static.licdn.com/aero-v1/sc/h/8ekq8gho1ruaf8i7f86vd1ftt",
			);
			icon.setAttribute("width", "16");
			icon.setAttribute("height", "16");
			post.appendChild(icon);

			const avatar = document.createElement("img");
			avatar.setAttribute(
				"src",
				"https://media.licdn.com/dms/image/v2/D4D03AQ/profile-displayphoto-scale_100_100/B4DZabc",
			);
			avatar.setAttribute("width", "48");
			avatar.setAttribute("height", "48");
			post.appendChild(avatar);

			const result = await extractPostData(post);
			expect(result).not.toBeNull();
			expect(result!.attachments).toEqual([]);
		});
	});
});
