import { describe, expect, it } from "bun:test";
import { extractPostData, readPostIdentity } from "./parser";

type ElementShape = Partial<{
	matches: (selector: string) => boolean;
	querySelector: (selector: string) => unknown;
	querySelectorAll: (selector: string) => unknown[];
	getAttribute: (name: string) => string | null;
	textContent: string;
}>;

function makeElement(overrides: ElementShape = {}): HTMLElement {
	return {
		matches: overrides.matches ?? (() => false),
		querySelector: overrides.querySelector ?? (() => null),
		querySelectorAll: overrides.querySelectorAll ?? (() => []),
		getAttribute: overrides.getAttribute ?? (() => null),
		textContent: overrides.textContent ?? "",
		closest: () => null,
	} as unknown as HTMLElement;
}

function makeNode(
	attrs: Record<string, string>,
	textContent = "",
): HTMLElement {
	return makeElement({
		getAttribute: (name) => attrs[name] ?? null,
		textContent,
	});
}

describe("reddit parser", () => {
	describe("readPostIdentity", () => {
		it("reads t3_ id from id attribute", () => {
			const el = makeElement({
				getAttribute: (name) => (name === "id" ? "t3_abc123" : null),
			});
			expect(readPostIdentity(el)).toBe("t3_abc123");
		});

		it("reads data-post-id when wrapper contains post metadata", () => {
			const el = makeElement({
				getAttribute: (name) => (name === "data-post-id" ? "t3_wrapped" : null),
			});
			expect(readPostIdentity(el)).toBe("t3_wrapped");
		});

		it("falls back to permalink link href", () => {
			const el = makeElement({
				getAttribute: () => null,
				querySelector: (selector) => {
					if (selector.includes("/comments/")) {
						return makeNode({
							href: "/r/test/comments/abc123/sample_post/",
						});
					}
					return null;
				},
			});
			expect(readPostIdentity(el)).toBe("/r/test/comments/abc123/sample_post/");
		});

		it("builds deterministic ad identity when no canonical post id exists", () => {
			const el = makeElement({
				getAttribute: (name) => {
					if (name === "post-title") return "AI Course Bundle";
					if (name === "author") return "ad_account";
					if (name === "domain") return "example.com";
					return null;
				},
			});
			expect(readPostIdentity(el)).toBe(
				"ad:ai course bundle|ad_account|example.com",
			);
		});

		it("returns null when nothing matches", () => {
			const el = makeElement();
			expect(readPostIdentity(el)).toBeNull();
		});
	});

	describe("extractPostData", () => {
		it("returns null for non-post elements", async () => {
			const el = makeElement();
			expect(await extractPostData(el)).toBeNull();
		});

		it("returns null for elements with no title and no body", async () => {
			const el = makeElement({
				matches: (selector) => selector.includes("shreddit-post"),
			});
			expect(await extractPostData(el)).toBeNull();
		});

		it("extracts shreddit post metadata and image attachments", async () => {
			const imageA = makeNode({
				src: "https://cdn.reddit.com/a.jpg",
				alt: "A",
			});
			const imageADupe = makeNode({
				src: "https://cdn.reddit.com/a.jpg",
				alt: "A2",
			});
			const imageB = makeNode({
				src: "https://cdn.reddit.com/b.jpg",
				alt: "B",
			});
			const body = makeNode({}, "Body text for the post");

			const el = makeElement({
				matches: (selector) => selector.includes("shreddit-post"),
				getAttribute: (name) => {
					if (name === "id") return "t3_post1";
					if (name === "author") return "u/test_user";
					if (name === "post-title") return "Shreddit title";
					if (name === "subreddit-name") return "programming";
					if (name === "post-type") return "gallery";
					if (name === "content-href")
						return "https://www.reddit.com/gallery/t3_post1";
					return null;
				},
				querySelectorAll: (selector) => {
					if (selector.includes('[slot="text-body"]')) {
						return [body];
					}
					if (selector.includes('[slot="post-media-container"]')) {
						return [imageA, imageADupe, imageB];
					}
					return [];
				},
			});

			const result = await extractPostData(el);
			expect(result).not.toBeNull();
			expect(result!.post_id).toBe("t3_post1");
			expect(result!.author_id).toBe("test_user");
			expect(result!.author_name).toBe("test_user");
			expect(result!.nodes).toHaveLength(1);
			expect(result!.nodes[0].text).toContain("shreddit title");
			expect(result!.nodes[0].text).toContain("body text for the post");
			expect(result!.nodes[0].text).toContain("subreddit r/programming");
			expect(result!.nodes[0].text).toContain("post type gallery");
			expect(result!.nodes[0].text).toContain("link domain www.reddit.com");
			expect(result!.attachments).toHaveLength(2);
			expect(result!.attachments[0]).toEqual({
				node_id: "root",
				kind: "image",
				src: "https://cdn.reddit.com/a.jpg",
				alt: "A",
				ordinal: 0,
			});
			expect(result!.attachments[1]).toEqual({
				node_id: "root",
				kind: "image",
				src: "https://cdn.reddit.com/b.jpg",
				alt: "B",
				ordinal: 1,
			});
		});

		it("derives author from /user href when author attribute is absent", async () => {
			const authorEl = makeNode({ href: "/user/spez" }, "u/spez");

			const el = makeElement({
				matches: (selector) => selector.includes("shreddit-post"),
				getAttribute: (name) => {
					if (name === "id") return "t3_no_attr_author";
					if (name === "post-title") return "No author attribute";
					return null;
				},
				querySelector: (selector) => {
					if (
						selector.includes('[data-testid="post-author"]') ||
						selector.includes('a[href*="/user/"]')
					) {
						return authorEl;
					}
					return null;
				},
			});

			const result = await extractPostData(el);
			expect(result).not.toBeNull();
			expect(result!.author_id).toBe("spez");
			expect(result!.author_name).toBe("spez");
		});

		it("extracts sponsored ad posts and assigns deterministic ad identity", async () => {
			const adEl = makeElement({
				matches: (selector) => selector.includes("shreddit-ad-post"),
				getAttribute: (name) => {
					if (name === "post-title") return "Try GLM-5 Free";
					if (name === "author") return "kiloCode";
					if (name === "ad-type") return "display";
					if (name === "domain") return "kilo.ai";
					return null;
				},
			});

			const result = await extractPostData(adEl);
			expect(result).not.toBeNull();
			expect(result!.post_id.startsWith("ad:")).toBe(true);
			expect(result!.author_id).toBe("kiloCode");
			expect(result!.nodes[0].text).toContain("try glm-5 free");
			expect(result!.nodes[0].text).toContain("post type ad:display");
			expect(result!.nodes[0].text).toContain("sponsored domain kilo.ai");
		});
	});
});
