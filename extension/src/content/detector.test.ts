import { describe, expect, it } from "bun:test";
import { collectHints, detectPost, scanFeed } from "./detector";
import type { DetectionProfile } from "../platforms/platform";

// ── Helpers ────────────────────────────────────────────────────────────────

function el(tag: string, attrs: Record<string, string> = {}): HTMLElement {
	const e = document.createElement(tag);
	for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
	return e;
}

/** Minimal profile: one signal that matches elements with data-post="true". */
function makeProfile(
	overrides: Partial<DetectionProfile> = {},
): DetectionProfile {
	return {
		hintSelectors: ["[data-hint]"],
		maxAncestorDepth: 5,
		minScore: 1,
		fallbackRejectStreak: 3,
		signals: [
			{
				id: "has_post_attr",
				weight: 2,
				test: (el) => el.hasAttribute("data-post"),
			},
		],
		resolveContentRoot: (candidate) => candidate,
		...overrides,
	};
}

// ── collectHints ───────────────────────────────────────────────────────────

describe("collectHints", () => {
	it("returns empty array for non-element nodes", () => {
		const text = document.createTextNode("hello");
		expect(collectHints(text, ["[data-hint]"])).toEqual([]);
	});

	it("matches the node itself when it matches a selector", () => {
		const node = el("div", { "data-hint": "true" });
		const hints = collectHints(node, ["[data-hint]"]);
		expect(hints).toHaveLength(1);
		expect(hints[0]).toBe(node);
	});

	it("matches descendants", () => {
		const parent = el("div");
		const child = el("span", { "data-hint": "true" });
		parent.appendChild(child);
		const hints = collectHints(parent, ["[data-hint]"]);
		expect(hints).toContain(child);
	});

	it("matches both self and descendants", () => {
		const parent = el("div", { "data-hint": "true" });
		const child = el("span", { "data-hint": "true" });
		parent.appendChild(child);
		const hints = collectHints(parent, ["[data-hint]"]);
		expect(hints).toHaveLength(2);
	});

	it("returns empty when no selectors match", () => {
		const node = el("div", { "data-other": "true" });
		expect(collectHints(node, ["[data-hint]"])).toHaveLength(0);
	});
});

// ── detectPost ─────────────────────────────────────────────────────────────

describe("detectPost", () => {
	it("returns null when best score is below minScore", () => {
		const profile = makeProfile({ minScore: 5 }); // requires score >= 5, signal gives 2
		const hint = el("span", { "data-hint": "true" });
		const parent = el("div"); // no data-post, so score = 0
		parent.appendChild(hint);
		document.body.appendChild(parent);

		const result = detectPost(hint, profile, () => "id-1");
		expect(result).toBeNull();

		document.body.removeChild(parent);
	});

	it("returns a surface when a scoring ancestor is found", () => {
		const profile = makeProfile();
		const hint = el("span", { "data-hint": "true" });
		const post = el("article", { "data-post": "true" });
		post.appendChild(hint);
		document.body.appendChild(post);

		const result = detectPost(hint, profile, () => "post-123");
		expect(result).not.toBeNull();
		expect(result?.identity).toBe("post-123");
		expect(result?.contentRoot).toBe(post);

		document.body.removeChild(post);
	});

	it("returns null when identity cannot be read", () => {
		const profile = makeProfile();
		const hint = el("span", { "data-hint": "true" });
		const post = el("article", { "data-post": "true" });
		post.appendChild(hint);
		document.body.appendChild(post);

		const result = detectPost(hint, profile, () => null);
		expect(result).toBeNull();

		document.body.removeChild(post);
	});

	it("returns null when resolveContentRoot returns null", () => {
		const profile = makeProfile({ resolveContentRoot: () => null });
		const hint = el("span", { "data-hint": "true" });
		const post = el("article", { "data-post": "true" });
		post.appendChild(hint);
		document.body.appendChild(post);

		const result = detectPost(hint, profile, () => "id-1");
		expect(result).toBeNull();

		document.body.removeChild(post);
	});

	it("uses resolveRenderRoot and resolveLabelRoot when provided", () => {
		const renderRoot = el("section");
		const labelRoot = el("header");
		const profile = makeProfile({
			resolveRenderRoot: () => renderRoot,
			resolveLabelRoot: () => labelRoot,
		});
		const hint = el("span", { "data-hint": "true" });
		const post = el("article", { "data-post": "true" });
		post.appendChild(hint);
		document.body.appendChild(post);

		const result = detectPost(hint, profile, () => "id-1");
		expect(result?.renderRoot).toBe(renderRoot);
		expect(result?.labelRoot).toBe(labelRoot);

		document.body.removeChild(post);
	});
});

// ── scanFeed ───────────────────────────────────────────────────────────────

describe("scanFeed", () => {
	it("returns all detected surfaces in the feed", () => {
		const profile = makeProfile();
		const feed = el("div");

		for (let i = 0; i < 3; i++) {
			const post = el("article", { "data-post": "true" });
			const hint = el("span", { "data-hint": "true" });
			post.appendChild(hint);
			feed.appendChild(post);
		}
		document.body.appendChild(feed);

		const surfaces = scanFeed(
			feed,
			profile,
			(el) => el.getAttribute("data-post") && `id-${Math.random()}`,
		);
		expect(surfaces.length).toBe(3);

		document.body.removeChild(feed);
	});

	it("deduplicates surfaces with the same renderRoot", () => {
		const profile = makeProfile();
		const feed = el("div");
		const post = el("article", { "data-post": "true" });
		// Two hints inside the same post
		post.appendChild(el("span", { "data-hint": "true" }));
		post.appendChild(el("span", { "data-hint": "true" }));
		feed.appendChild(post);
		document.body.appendChild(feed);

		const surfaces = scanFeed(feed, profile, () => "same-id");
		expect(surfaces.length).toBe(1);

		document.body.removeChild(feed);
	});

	it("returns empty array when no hints match", () => {
		const profile = makeProfile();
		const feed = el("div");
		feed.appendChild(el("p")); // no hint attr
		document.body.appendChild(feed);

		const surfaces = scanFeed(feed, profile, () => "id");
		expect(surfaces).toHaveLength(0);

		document.body.removeChild(feed);
	});
});
