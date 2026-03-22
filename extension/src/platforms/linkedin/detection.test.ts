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
	it("single post detected; identity = data-urn; renderRoot = [data-finite-scroll-hotkey-item] div; labelRoot = article", () => {
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
		expect(surfaces[0]!.labelRoot).toBe(post.firstElementChild);
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
		expect(surfaces[0]!.labelRoot).toBe(post);
	});
});

// ── SDUI DOM helpers ──────────────────────────────────────────────────────

/**
 * Build a realistic SDUI-style LinkedIn post DOM matching the actual
 * minified DOM. Key structural detail: `role="listitem"` is NOT a direct
 * child of `role="list"` — there are wrapper divs in between.
 *
 *   <div role="list" data-testid="mainFeed" data-component-type="LazyColumn">
 *     <div class="wrapper1">                              ← wrapper div
 *       <div class="wrapper2">                            ← wrapper div
 *         <div class="wrapper3">                          ← wrapper div
 *           <div role="listitem" componentkey="expandedXYZFeedType_MAIN_FEED_RECENT">
 *             <h2><span>Feed post</span></h2>
 *             <a href="/in/johndoe/">John Doe</a>
 *             <span data-testid="expandable-text-box">Sample post text…</span>
 *             <button aria-label="Reaction button state: no reaction">Like</button>
 *             <button aria-label="Comment">Comment</button>
 *             <button aria-label="Repost">Repost</button>
 *           </div>
 *         </div>
 *       </div>
 *     </div>
 *   </div>
 */
function makeSduiPost(
	opts: {
		text?: string;
		authorHref?: string;
		includeActionButtons?: boolean;
		includeFeedContainer?: boolean;
		includeExpandableTextBox?: boolean;
		componentKey?: string;
	} = {},
): { feedRoot: HTMLElement; postItem: HTMLElement } {
	const {
		text = "Sample post text goes here for testing purposes.",
		authorHref = "/in/johndoe/",
		includeActionButtons = true,
		includeFeedContainer = true,
		includeExpandableTextBox = true,
		componentKey = "expandedABC123FeedType_MAIN_FEED_RECENT",
	} = opts;

	const postItem = document.createElement("div");
	postItem.setAttribute("role", "listitem");
	postItem.setAttribute("componentkey", componentKey);

	// Screen-reader post header
	const h2 = document.createElement("h2");
	const srSpan = document.createElement("span");
	srSpan.textContent = "Feed post";
	h2.appendChild(srSpan);
	postItem.appendChild(h2);

	// Author link
	const authorLink = document.createElement("a");
	authorLink.setAttribute("href", authorHref);
	authorLink.textContent = "John Doe";
	postItem.appendChild(authorLink);

	// Post text — in real DOM this is inside an expandable-text-box span
	if (includeExpandableTextBox) {
		const textSpan = document.createElement("span");
		textSpan.setAttribute("data-testid", "expandable-text-box");
		textSpan.textContent = text;
		postItem.appendChild(textSpan);
	} else {
		const p = document.createElement("p");
		p.textContent = text;
		postItem.appendChild(p);
	}

	if (includeActionButtons) {
		const likeBtn = document.createElement("button");
		likeBtn.setAttribute("aria-label", "Reaction button state: no reaction");
		likeBtn.textContent = "Like";
		postItem.appendChild(likeBtn);

		const commentBtn = document.createElement("button");
		commentBtn.setAttribute("aria-label", "Comment");
		commentBtn.textContent = "Comment";
		postItem.appendChild(commentBtn);

		const repostBtn = document.createElement("button");
		repostBtn.setAttribute("aria-label", "Repost");
		repostBtn.textContent = "Repost";
		postItem.appendChild(repostBtn);
	}

	if (includeFeedContainer) {
		// Realistic nesting: list > wrapper > wrapper > wrapper > listitem
		const feedRoot = document.createElement("div");
		feedRoot.setAttribute("role", "list");
		feedRoot.setAttribute("data-testid", "mainFeed");
		feedRoot.setAttribute("data-component-type", "LazyColumn");

		const wrapper1 = document.createElement("div");
		const wrapper2 = document.createElement("div");
		const wrapper3 = document.createElement("div");

		wrapper3.appendChild(postItem);
		wrapper2.appendChild(wrapper3);
		wrapper1.appendChild(wrapper2);
		feedRoot.appendChild(wrapper1);

		return { feedRoot, postItem };
	}

	return { feedRoot: postItem, postItem };
}

// ── SDUI Detection Tests ──────────────────────────────────────────────────

describe("LinkedIn SDUI detection (minified/premium DOM)", () => {
	it("detects SDUI post even with wrapper divs between list and listitem", () => {
		const { feedRoot } = makeSduiPost();
		feedContainer.appendChild(feedRoot);

		const surfaces = scanFeed(
			feedContainer,
			linkedinDetectionProfile,
			readPostIdentity,
		);

		expect(surfaces).toHaveLength(1);
		expect(surfaces[0]!.identity).toStartWith("text-hash:");
	});

	it("detects two SDUI posts in the same feed with wrapper nesting", () => {
		const feedRoot = document.createElement("div");
		feedRoot.setAttribute("role", "list");
		feedRoot.setAttribute("data-testid", "mainFeed");

		const { postItem: post1 } = makeSduiPost({
			text: "First post about engineering practices.",
			componentKey: "expandedPost1FeedType_MAIN_FEED_RECENT",
			includeFeedContainer: false,
		});
		const { postItem: post2 } = makeSduiPost({
			text: "Second post about product management strategies.",
			authorHref: "/company/acme-corp/",
			componentKey: "expandedPost2FeedType_MAIN_FEED_RECENT",
			includeFeedContainer: false,
		});

		// Each post is in its own wrapper chain
		const wrap1a = document.createElement("div");
		const wrap1b = document.createElement("div");
		wrap1b.appendChild(post1);
		wrap1a.appendChild(wrap1b);

		const wrap2a = document.createElement("div");
		const wrap2b = document.createElement("div");
		wrap2b.appendChild(post2);
		wrap2a.appendChild(wrap2b);

		feedRoot.appendChild(wrap1a);
		feedRoot.appendChild(wrap2a);
		feedContainer.appendChild(feedRoot);

		const surfaces = scanFeed(
			feedContainer,
			linkedinDetectionProfile,
			readPostIdentity,
		);

		expect(surfaces).toHaveLength(2);
		expect(surfaces[0]!.identity).not.toBe(surfaces[1]!.identity);
	});

	it("does NOT detect listitem without social action buttons (sidebar items)", () => {
		const { feedRoot } = makeSduiPost({ includeActionButtons: false });
		feedContainer.appendChild(feedRoot);

		const surfaces = scanFeed(
			feedContainer,
			linkedinDetectionProfile,
			readPostIdentity,
		);

		expect(surfaces).toHaveLength(0);
	});

	it("does NOT detect listitem without author links", () => {
		const feedRoot = document.createElement("div");
		feedRoot.setAttribute("role", "list");

		const postItem = document.createElement("div");
		postItem.setAttribute("role", "listitem");
		postItem.setAttribute("componentkey", "expandedXYZFeedType_MAIN_FEED_RECENT");
		const p = document.createElement("p");
		p.textContent = "Some random sidebar text";
		postItem.appendChild(p);
		// Has buttons but no author link
		const btn = document.createElement("button");
		btn.setAttribute("aria-label", "Reaction button state: no reaction");
		postItem.appendChild(btn);
		const btn2 = document.createElement("button");
		btn2.setAttribute("aria-label", "Comment");
		postItem.appendChild(btn2);

		// Wrapper nesting
		const wrapper = document.createElement("div");
		wrapper.appendChild(postItem);
		feedRoot.appendChild(wrapper);
		feedContainer.appendChild(feedRoot);

		const surfaces = scanFeed(
			feedContainer,
			linkedinDetectionProfile,
			readPostIdentity,
		);

		expect(surfaces).toHaveLength(0);
	});

	it("SDUI renderRoot is the listitem element (not a wrapper)", () => {
		const { feedRoot, postItem } = makeSduiPost();
		feedContainer.appendChild(feedRoot);

		const surfaces = scanFeed(
			feedContainer,
			linkedinDetectionProfile,
			readPostIdentity,
		);

		expect(surfaces).toHaveLength(1);
		expect(surfaces[0]!.renderRoot).toBe(postItem);
	});

	it("SDUI identity is text-hash based (no data-urn available)", () => {
		const { feedRoot } = makeSduiPost({
			text: "A unique post about cloud infrastructure.",
		});
		feedContainer.appendChild(feedRoot);

		const surfaces = scanFeed(
			feedContainer,
			linkedinDetectionProfile,
			readPostIdentity,
		);

		expect(surfaces).toHaveLength(1);
		expect(surfaces[0]!.identity).toStartWith("text-hash:");
	});

	it("classic DOM posts still work alongside SDUI", () => {
		// Classic post
		const classicPost = makePost({ urn: "urn:li:activity:777" });
		feedContainer.appendChild(classicPost);

		// SDUI post
		const { feedRoot } = makeSduiPost({
			text: "An SDUI post about team productivity.",
		});
		feedContainer.appendChild(feedRoot);

		const surfaces = scanFeed(
			feedContainer,
			linkedinDetectionProfile,
			readPostIdentity,
		);

		expect(surfaces).toHaveLength(2);
		// One classic (urn identity) and one SDUI (text-hash identity)
		const identities = surfaces.map((s) => s.identity);
		expect(identities).toContain("urn:li:activity:777");
		expect(identities.some((id) => id.startsWith("text-hash:"))).toBe(true);
	});

	it("SDUI with company author href is detected", () => {
		const { feedRoot } = makeSduiPost({
			text: "Company post about our latest product launch.",
			authorHref: "/company/acme-corp/posts/",
		});
		feedContainer.appendChild(feedRoot);

		const surfaces = scanFeed(
			feedContainer,
			linkedinDetectionProfile,
			readPostIdentity,
		);

		expect(surfaces).toHaveLength(1);
	});

	it("expandable-text-box hint alone discovers SDUI posts", () => {
		// Even if role="listitem" selector somehow failed,
		// the expandable-text-box should still lead to discovering the post
		const { feedRoot } = makeSduiPost();
		feedContainer.appendChild(feedRoot);

		// Verify the selector matches
		const textBoxes = feedContainer.querySelectorAll('[data-testid="expandable-text-box"]');
		expect(textBoxes.length).toBeGreaterThan(0);

		const surfaces = scanFeed(
			feedContainer,
			linkedinDetectionProfile,
			readPostIdentity,
		);

		expect(surfaces).toHaveLength(1);
	});

	it("componentkey hint discovers SDUI posts", () => {
		const { feedRoot } = makeSduiPost();
		feedContainer.appendChild(feedRoot);

		// Verify the selector matches
		const componentKeyEls = feedContainer.querySelectorAll('[componentkey*="FeedType_MAIN_FEED"]');
		expect(componentKeyEls.length).toBeGreaterThan(0);

		const surfaces = scanFeed(
			feedContainer,
			linkedinDetectionProfile,
			readPostIdentity,
		);

		expect(surfaces).toHaveLength(1);
	});
});
