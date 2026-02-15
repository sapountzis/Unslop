// Reddit DOM parser
import { normalizeContentText, derivePostId } from "../../lib/hash";
import { PostData, PostNode } from "../../types";
import { SELECTORS } from "./selectors";

export function readPostIdentity(element: HTMLElement): string | null {
	// shreddit-post uses id attribute directly (e.g. "t3_abc123")
	const id = element.getAttribute("id");
	if (id && id.startsWith("t3_")) return id;

	// Try data-fullname / data-thing-id (old reddit)
	const fullname = element.getAttribute("data-fullname");
	if (fullname) return fullname;

	// Try permalink-based identity
	const permalink = element.getAttribute("permalink");
	if (permalink) return permalink;

	// Try to find via link
	const titleLink = element.querySelector('a[href*="/comments/"]');
	if (titleLink) {
		const href = titleLink.getAttribute("href");
		if (href) return href;
	}

	return null;
}

function extractTitle(element: HTMLElement): string {
	// shreddit-post has a post-title attribute
	const titleAttr = element.getAttribute("post-title");
	if (titleAttr) return normalizeContentText(titleAttr);

	const titleEl = element.querySelector(SELECTORS.postTitle);
	return normalizeContentText(titleEl?.textContent ?? "");
}

function extractBodyText(element: HTMLElement): string {
	const bodyEl = element.querySelector(SELECTORS.postBody);
	return normalizeContentText(bodyEl?.textContent ?? "");
}

function extractAuthorId(element: HTMLElement): string {
	// shreddit-post has an author attribute
	const authorAttr = element.getAttribute("author");
	if (authorAttr) return authorAttr;

	const authorEl = element.querySelector(SELECTORS.authorName);
	if (authorEl) {
		// Try href first
		const href = authorEl.getAttribute("href");
		if (href) {
			const match = href.match(/\/user\/([^/?]+)/);
			if (match?.[1]) return match[1];
		}
		// Fallback to text
		const text = authorEl.textContent?.trim();
		if (text) {
			// Remove u/ prefix if present
			return text.replace(/^u\//, "");
		}
	}

	return "unknown";
}

function isRedditPost(element: HTMLElement): boolean {
	return (
		element.matches(SELECTORS.candidatePostRoot) ||
		element.querySelector(SELECTORS.postTitle) !== null
	);
}

export async function extractPostData(
	element: HTMLElement,
): Promise<PostData | null> {
	if (!isRedditPost(element)) {
		return null;
	}

	const title = extractTitle(element);
	const bodyText = extractBodyText(element);

	// Reddit posts always have a title; if none, this isn't a real post
	if (!title && !bodyText) {
		return null;
	}

	const authorId = extractAuthorId(element);

	// Combine title + body for the root node
	const combinedText = bodyText ? `${title}\n\n${bodyText}` : title;

	const nodes: PostNode[] = [
		{
			id: "root",
			parent_id: null,
			kind: "root",
			text: combinedText,
		},
	];

	const identity = readPostIdentity(element);
	const deterministicNodeKey = nodes
		.map(
			(node) =>
				`${node.id}|${node.parent_id ?? "null"}|${node.kind}|${node.text}`,
		)
		.join("\n");
	const postId =
		identity || (await derivePostId(authorId, deterministicNodeKey));

	return {
		post_id: postId,
		author_id: authorId,
		author_name: authorId,
		nodes,
		attachments: [],
	};
}
