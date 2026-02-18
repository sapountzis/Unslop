import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { scanFeed } from "../../content/detector";
import { linkedinDetectionProfile } from "./detectionProfile";
import { readPostIdentity } from "./parser";

// ── DOM helpers ────────────────────────────────────────────────────────────

let feedContainer: HTMLElement;

beforeEach(() => {
	feedContainer = document.createElement("div");
	document.body.appendChild(feedContainer);
});

afterEach(() => {
	feedContainer.remove();
});

/**
 * Build a minimal valid LinkedIn post DOM:
 *
 *   <div data-finite-scroll-hotkey-item="">      ← resolveRenderRoot target
 *     <article role="article" data-urn="urn:li:activity:123">
 *       <p>Post text</p>
 *       <a href="/in/johndoe/">John Doe</a>
 *     </article>
 *   </div>
 */
function makePost(
	opts: {
		urn?: string;
		dataId?: string;
		includeScrollItem?: boolean;
		isAggregate?: boolean;
	} = {},
): HTMLElement {
	const {
		urn = "urn:li:activity:123",
		dataId,
		includeScrollItem = true,
		isAggregate = false,
	} = opts;

	const article = document.createElement("article");
	article.setAttribute("role", "article");
	if (isAggregate) {
		article.setAttribute("data-urn", "urn:li:aggregate:789");
	} else {
		if (dataId) {
			article.setAttribute("data-id", dataId);
		}
		article.setAttribute("data-urn", urn);
	}
	const p = document.createElement("p");
	p.textContent = "Post text";
	article.appendChild(p);
	const a = document.createElement("a");
	a.setAttribute("href", "/in/johndoe/");
	a.textContent = "John Doe";
	article.appendChild(a);

	if (includeScrollItem) {
		const scrollItem = document.createElement("div");
		scrollItem.setAttribute("data-finite-scroll-hotkey-item", "");
		scrollItem.appendChild(article);
		return scrollItem;
	}
	return article;
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("LinkedIn detection smoke tests", () => {
	it("single post detected; identity = data-urn; renderRoot = [data-finite-scroll-hotkey-item] div", () => {
		const post = makePost({ urn: "urn:li:activity:123" });
		feedContainer.appendChild(post);

		const surfaces = scanFeed(
			feedContainer,
			linkedinDetectionProfile,
			readPostIdentity,
		);

		expect(surfaces).toHaveLength(1);
		expect(surfaces[0]!.identity).toBe("urn:li:activity:123");
		expect(surfaces[0]!.renderRoot).toBe(post); // the scroll-item div
	});

	it("two posts → 2 surfaces", () => {
		feedContainer.appendChild(makePost({ urn: "urn:li:activity:1" }));
		feedContainer.appendChild(makePost({ urn: "urn:li:activity:2" }));

		const surfaces = scanFeed(
			feedContainer,
			linkedinDetectionProfile,
			readPostIdentity,
		);

		expect(surfaces).toHaveLength(2);
	});

	it("empty feed → 0 surfaces", () => {
		const surfaces = scanFeed(
			feedContainer,
			linkedinDetectionProfile,
			readPostIdentity,
		);
		expect(surfaces).toHaveLength(0);
	});

	it("data-id on the renderRoot takes priority over nested data-urn", () => {
		// readPostIdentity checks data-id first, then data-urn.
		// detectPost reads identity from renderRoot first.
		// Putting data-id on the scroll-item (renderRoot) makes it win.
		const post = makePost({ urn: "urn:li:activity:999" });
		post.setAttribute("data-id", "custom-id-42"); // post IS the scroll-item (renderRoot)
		feedContainer.appendChild(post);

		const surfaces = scanFeed(
			feedContainer,
			linkedinDetectionProfile,
			readPostIdentity,
		);

		expect(surfaces).toHaveLength(1);
		expect(surfaces[0]!.identity).toBe("custom-id-42");
	});

	it("aggregate container is rejected due to aggregate_penalty", () => {
		const post = makePost({ isAggregate: true });
		feedContainer.appendChild(post);

		const surfaces = scanFeed(
			feedContainer,
			linkedinDetectionProfile,
			readPostIdentity,
		);

		expect(surfaces).toHaveLength(0);
	});

	it("no [data-finite-scroll-hotkey-item] ancestor → renderRoot falls back to contentRoot", () => {
		const post = makePost({
			includeScrollItem: false,
			urn: "urn:li:activity:555",
		});
		feedContainer.appendChild(post);

		const surfaces = scanFeed(
			feedContainer,
			linkedinDetectionProfile,
			readPostIdentity,
		);

		expect(surfaces).toHaveLength(1);
		// renderRoot should be the article itself (contentRoot) since no scroll item
		expect(surfaces[0]!.renderRoot).toBe(post);
	});
});
