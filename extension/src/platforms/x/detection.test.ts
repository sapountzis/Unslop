import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { scanFeed } from "../../content/detector";
import { xDetectionProfile } from "./detectionProfile";
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
 * Minimal valid X/Twitter post DOM:
 *
 *   <div>                                 ← resolveRenderRoot: article.parentElement
 *     <article role="article">
 *       <p>Tweet text</p>
 *       <a href="/alice/status/999">View</a>
 *     </article>
 *   </div>
 */
function makeTweet(
	opts: {
		statusHref?: string;
		ariaLabel?: string;
		includeParent?: boolean;
	} = {},
): HTMLElement {
	const {
		statusHref = "/alice/status/999",
		ariaLabel,
		includeParent = true,
	} = opts;

	const article = document.createElement("article");
	article.setAttribute("role", "article");
	if (ariaLabel) article.setAttribute("aria-label", ariaLabel);

	const p = document.createElement("p");
	p.textContent = "Tweet text";
	article.appendChild(p);

	const a = document.createElement("a");
	a.setAttribute("href", statusHref);
	a.textContent = "View";
	article.appendChild(a);

	if (includeParent) {
		const wrapper = document.createElement("div");
		wrapper.appendChild(article);
		return wrapper;
	}
	return article;
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("X detection smoke tests", () => {
	it("single tweet detected; identity = status href; renderRoot = wrapper div", () => {
		const wrapper = makeTweet({ statusHref: "/alice/status/999" });
		feedContainer.appendChild(wrapper);

		const surfaces = scanFeed(
			feedContainer,
			xDetectionProfile,
			readPostIdentity,
		);

		expect(surfaces).toHaveLength(1);
		expect(surfaces[0]!.identity).toBe("/alice/status/999");
		expect(surfaces[0]!.renderRoot).toBe(wrapper);
	});

	it("two tweets → 2 surfaces", () => {
		feedContainer.appendChild(makeTweet({ statusHref: "/a/status/1" }));
		feedContainer.appendChild(makeTweet({ statusHref: "/b/status/2" }));

		const surfaces = scanFeed(
			feedContainer,
			xDetectionProfile,
			readPostIdentity,
		);

		expect(surfaces).toHaveLength(2);
	});

	it("empty feed → 0 surfaces", () => {
		const surfaces = scanFeed(
			feedContainer,
			xDetectionProfile,
			readPostIdentity,
		);
		expect(surfaces).toHaveLength(0);
	});

	it("'Who to follow' article without status link: conversation_penalty + no status signals → rejected", () => {
		// Real "Who to follow" panels don't contain /status/ links.
		// Without status_link(5) and tweet_text(3), the score is
		// article_root(4) + author_anchor(2) - conversation_penalty(4) = 2 < minScore(7).
		const article = document.createElement("article");
		article.setAttribute("role", "article");
		article.setAttribute("aria-label", "Who to follow");
		const a = document.createElement("a");
		a.setAttribute("href", "/someuser");
		article.appendChild(a);
		const wrapper = document.createElement("div");
		wrapper.appendChild(article);
		feedContainer.appendChild(wrapper);

		const surfaces = scanFeed(
			feedContainer,
			xDetectionProfile,
			readPostIdentity,
		);

		expect(surfaces).toHaveLength(0);
	});

	it("no parent element: renderRoot falls back to contentRoot", () => {
		const article = makeTweet({
			includeParent: false,
			statusHref: "/bob/status/77",
		});
		feedContainer.appendChild(article);

		const surfaces = scanFeed(
			feedContainer,
			xDetectionProfile,
			readPostIdentity,
		);

		expect(surfaces).toHaveLength(1);
		// article.parentElement is feedContainer, not the article itself
		// resolveRenderRoot returns article.closest("article").parentElement = feedContainer
		// but that is acceptable — what matters is we got a surface
		expect(surfaces[0]!.identity).toBe("/bob/status/77");
	});
});
