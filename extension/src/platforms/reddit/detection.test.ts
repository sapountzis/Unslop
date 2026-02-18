import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { scanFeed } from "../../content/detector";
import { redditDetectionProfile } from "./detectionProfile";
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
 * Minimal valid Reddit post DOM:
 *
 *   <shreddit-feed>
 *     <shreddit-post
 *       id="t3_abc123"
 *       post-title="Cool post"
 *       author="some_user"
 *       permalink="/r/test/comments/abc123/">
 *     </shreddit-post>
 *   </shreddit-feed>
 */
function makeShredditFeed(...posts: HTMLElement[]): HTMLElement {
	const feed = document.createElement("shreddit-feed");
	for (const post of posts) feed.appendChild(post);
	return feed;
}

function makeShredditPost(
	opts: {
		id?: string;
		postTitle?: string;
		author?: string;
		permalink?: string;
		dataPostId?: string;
	} = {},
): HTMLElement {
	const {
		id = "t3_abc123",
		postTitle = "Cool post",
		author = "some_user",
		permalink = "/r/test/comments/abc123/",
		dataPostId,
	} = opts;

	const post = document.createElement("shreddit-post");
	if (id) post.setAttribute("id", id);
	if (postTitle) post.setAttribute("post-title", postTitle);
	if (author) post.setAttribute("author", author);
	if (permalink) post.setAttribute("permalink", permalink);
	if (dataPostId) post.setAttribute("data-post-id", dataPostId);
	return post;
}

function makeShredditAdPost(
	opts: { postTitle?: string; author?: string; domain?: string } = {},
): HTMLElement {
	const {
		postTitle = "Ad title",
		author = "advertiser",
		domain = "example.com",
	} = opts;

	const post = document.createElement("shreddit-ad-post");
	if (postTitle) post.setAttribute("post-title", postTitle);
	if (author) post.setAttribute("author", author);
	if (domain) post.setAttribute("domain", domain);
	return post;
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("Reddit detection smoke tests", () => {
	it("single shreddit-post detected; identity = t3_ id; renderRoot === contentRoot", () => {
		const post = makeShredditPost({ id: "t3_abc123" });
		const feed = makeShredditFeed(post);
		feedContainer.appendChild(feed);

		const surfaces = scanFeed(
			feedContainer,
			redditDetectionProfile,
			readPostIdentity,
		);

		expect(surfaces).toHaveLength(1);
		expect(surfaces[0]!.identity).toBe("t3_abc123");
		expect(surfaces[0]!.renderRoot).toBe(surfaces[0]!.contentRoot);
	});

	it("multiple posts → N surfaces", () => {
		const feed = makeShredditFeed(
			makeShredditPost({ id: "t3_1", permalink: "/r/a/comments/1/" }),
			makeShredditPost({ id: "t3_2", permalink: "/r/a/comments/2/" }),
			makeShredditPost({ id: "t3_3", permalink: "/r/a/comments/3/" }),
		);
		feedContainer.appendChild(feed);

		const surfaces = scanFeed(
			feedContainer,
			redditDetectionProfile,
			readPostIdentity,
		);

		expect(surfaces).toHaveLength(3);
	});

	it("empty feed → 0 surfaces", () => {
		feedContainer.appendChild(makeShredditFeed());
		const surfaces = scanFeed(
			feedContainer,
			redditDetectionProfile,
			readPostIdentity,
		);
		expect(surfaces).toHaveLength(0);
	});

	it("shreddit-ad-post detected; identity derived from post-title|author|domain", () => {
		const ad = makeShredditAdPost({
			postTitle: "Ad title",
			author: "advertiser",
			domain: "example.com",
		});
		const feed = makeShredditFeed(ad);
		feedContainer.appendChild(feed);

		const surfaces = scanFeed(
			feedContainer,
			redditDetectionProfile,
			readPostIdentity,
		);

		expect(surfaces).toHaveLength(1);
		expect(surfaces[0]!.identity).toMatch(/^ad:/);
	});

	it("data-post-id identity takes priority over permalink attribute (no t3_ id)", () => {
		// readPostIdentity checks: (1) id starting with "t3_", (2) data-post-id, (3) permalink.
		// Using a non-t3_ id ensures data-post-id wins over permalink.
		const post = makeShredditPost({
			id: "other-id", // does NOT start with "t3_"
			permalink: "/r/test/comments/xyz/",
			dataPostId: "custom-post-id",
		});
		const feed = makeShredditFeed(post);
		feedContainer.appendChild(feed);

		const surfaces = scanFeed(
			feedContainer,
			redditDetectionProfile,
			readPostIdentity,
		);

		expect(surfaces).toHaveLength(1);
		expect(surfaces[0]!.identity).toBe("custom-post-id");
	});

	it("bare shreddit-post (no content attributes) scores below minScore and is rejected", () => {
		// shreddit_root(5) only → 5 < minScore(6) → rejected.
		const post = document.createElement("shreddit-post");
		// No post-title, author, permalink, id attributes
		const feed = makeShredditFeed(post);
		feedContainer.appendChild(feed);

		const surfaces = scanFeed(
			feedContainer,
			redditDetectionProfile,
			readPostIdentity,
		);

		expect(surfaces).toHaveLength(0);
	});
});
