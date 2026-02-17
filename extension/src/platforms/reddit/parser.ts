// Reddit DOM parser
import { normalizeContentText, derivePostId } from "../../lib/hash";
import { PostAttachment, PostData, PostNode } from "../../types";
import { SELECTORS } from "./selectors";

function queryAllElements(root: HTMLElement, selector: string): HTMLElement[] {
	const querySelectorAll = (
		root as unknown as {
			querySelectorAll?: (
				value: string,
			) => NodeListOf<HTMLElement> | HTMLElement[];
		}
	).querySelectorAll;

	if (typeof querySelectorAll !== "function") {
		return [];
	}

	const result = querySelectorAll.call(root, selector);
	if (Array.isArray(result)) {
		return result;
	}

	return Array.from(result);
}

function querySelectorElement(
	root: HTMLElement,
	selector: string,
): HTMLElement | null {
	const querySelector = (
		root as unknown as {
			querySelector?: (value: string) => HTMLElement | null;
		}
	).querySelector;

	if (typeof querySelector !== "function") {
		return null;
	}

	return querySelector.call(root, selector) as HTMLElement | null;
}

function readAttribute(
	element:
		| { getAttribute?: (name: string) => string | null }
		| null
		| undefined,
	attribute: string,
): string | null {
	if (!element || typeof element.getAttribute !== "function") {
		return null;
	}

	const value = element.getAttribute(attribute);
	if (!value) {
		return null;
	}

	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

function readAttributeFromSelfOrNested(
	element: HTMLElement,
	attribute: string,
): string | null {
	const direct = readAttribute(element, attribute);
	if (direct) return direct;

	const nestedPost = querySelectorElement(
		element,
		"shreddit-post, shreddit-ad-post",
	);
	return readAttribute(nestedPost, attribute);
}

function readText(
	element: { textContent?: string | null } | null | undefined,
): string {
	return normalizeContentText(element?.textContent ?? "");
}

function parseSrcset(srcset: string | null): string | null {
	if (!srcset) return null;
	const firstCandidate = srcset.split(",", 1)[0]?.trim().split(/\s+/, 1)[0];
	return firstCandidate || null;
}

function readImageSource(element: HTMLElement): string | null {
	const src = readAttribute(element, "src");
	if (src) return src;

	const currentSrc = (
		element as unknown as {
			currentSrc?: string;
		}
	).currentSrc;
	if (typeof currentSrc === "string" && currentSrc.trim().length > 0) {
		return currentSrc.trim();
	}

	return parseSrcset(readAttribute(element, "srcset"));
}

function normalizeAuthorId(value: string): string {
	return value.trim().replace(/^u\//i, "");
}

function normalizeSubreddit(value: string): string {
	return value
		.trim()
		.replace(/^\/?r\//i, "")
		.replace(/\/+$/, "");
}

function extractTitle(element: HTMLElement): string {
	const titleAttr = readAttributeFromSelfOrNested(element, "post-title");
	if (titleAttr) return normalizeContentText(titleAttr);

	return readText(querySelectorElement(element, SELECTORS.postTitle));
}

function extractBodyText(element: HTMLElement): string {
	const blocks = queryAllElements(element, SELECTORS.postBody)
		.map((block) => readText(block))
		.filter(Boolean);

	if (blocks.length === 0) {
		return readText(querySelectorElement(element, SELECTORS.postBody));
	}

	return normalizeContentText(blocks.join("\n\n"));
}

function extractAuthor(element: HTMLElement): { id: string; name: string } {
	const authorAttr = readAttributeFromSelfOrNested(element, "author");
	if (authorAttr) {
		const normalized = normalizeAuthorId(authorAttr);
		return {
			id: normalized || "unknown",
			name: normalized || "Unknown",
		};
	}

	const authorEl = querySelectorElement(element, SELECTORS.authorName);
	const authorHref = readAttribute(authorEl, "href");
	if (authorHref) {
		const match = authorHref.match(/\/user\/([^/?#]+)/i);
		if (match?.[1]) {
			const authorId = normalizeAuthorId(match[1]);
			return {
				id: authorId || "unknown",
				name: authorId || "Unknown",
			};
		}
	}

	const authorText = authorEl?.textContent?.trim() ?? "";
	if (authorText) {
		const normalized = normalizeAuthorId(authorText);
		return {
			id: normalized || "unknown",
			name: normalized || "Unknown",
		};
	}

	return { id: "unknown", name: "Unknown" };
}

function extractSubreddit(element: HTMLElement): string | null {
	const subredditAttr = readAttributeFromSelfOrNested(
		element,
		"subreddit-name",
	);
	if (subredditAttr) {
		const normalized = normalizeSubreddit(subredditAttr);
		return normalized || null;
	}

	const subredditEl = querySelectorElement(element, SELECTORS.subredditName);
	const subredditFromText = normalizeSubreddit(subredditEl?.textContent ?? "");
	if (subredditFromText) {
		return subredditFromText;
	}

	const href = readAttribute(subredditEl, "href");
	if (!href) return null;

	const match = href.match(/\/r\/([^/?#]+)/i);
	if (!match?.[1]) return null;
	return normalizeSubreddit(match[1]) || null;
}

function extractDomain(element: HTMLElement): string | null {
	const explicitDomain = readAttributeFromSelfOrNested(element, "domain");
	if (explicitDomain) return explicitDomain;

	const contentHref = readAttributeFromSelfOrNested(element, "content-href");
	if (!contentHref) return null;

	try {
		return new URL(contentHref, "https://www.reddit.com").hostname;
	} catch {
		return contentHref;
	}
}

function extractPostType(element: HTMLElement): string | null {
	const postType = readAttributeFromSelfOrNested(element, "post-type");
	if (postType) return postType;

	const adType = readAttributeFromSelfOrNested(element, "ad-type");
	if (adType) return `ad:${adType}`;

	return null;
}

function isAdPost(element: HTMLElement): boolean {
	if (element.matches("shreddit-ad-post")) {
		return true;
	}

	return readAttributeFromSelfOrNested(element, "ad-type") !== null;
}

function isRedditPost(element: HTMLElement): boolean {
	if (element.matches(SELECTORS.candidatePostRoot)) {
		return true;
	}

	if (readAttributeFromSelfOrNested(element, "post-title")) {
		return true;
	}

	return querySelectorElement(element, SELECTORS.postTitle) !== null;
}

function extractAttachmentRefs(element: HTMLElement): PostAttachment[] {
	const attachments: PostAttachment[] = [];
	const seen = new Set<string>();

	for (const imageNode of queryAllElements(element, SELECTORS.imageNodes)) {
		const src = readImageSource(imageNode);
		if (!src || seen.has(src)) continue;

		seen.add(src);
		attachments.push({
			node_id: "root",
			kind: "image",
			src,
			alt: (readAttribute(imageNode, "alt") || "").trim(),
			ordinal: attachments.length,
		});
	}

	return attachments;
}

function buildRootNodeText(
	title: string,
	bodyText: string,
	subreddit: string | null,
	postType: string | null,
	domain: string | null,
	adPost: boolean,
): string {
	const segments: string[] = [];

	if (title) {
		segments.push(title);
	}
	if (bodyText) {
		segments.push(bodyText);
	}
	if (subreddit) {
		segments.push(`subreddit r/${subreddit}`);
	}
	if (postType) {
		segments.push(`post type ${postType}`);
	}
	if (domain) {
		segments.push(`${adPost ? "sponsored" : "link"} domain ${domain}`);
	}

	return normalizeContentText(segments.join("\n\n"));
}

export function readPostIdentity(element: HTMLElement): string | null {
	const id = readAttributeFromSelfOrNested(element, "id");
	if (id && id.startsWith("t3_")) {
		return id;
	}

	const dataPostId = readAttributeFromSelfOrNested(element, "data-post-id");
	if (dataPostId) {
		return dataPostId;
	}

	const fullname = readAttributeFromSelfOrNested(element, "data-fullname");
	if (fullname) {
		return fullname;
	}

	const permalink = readAttributeFromSelfOrNested(element, "permalink");
	if (permalink) {
		return permalink;
	}

	const commentLink = querySelectorElement(element, SELECTORS.permalinkLink);
	const commentHref = readAttribute(commentLink, "href");
	if (commentHref) {
		return commentHref;
	}

	const adTitle = readAttributeFromSelfOrNested(element, "post-title") || "";
	const adAuthor = readAttributeFromSelfOrNested(element, "author") || "";
	const adDomain = readAttributeFromSelfOrNested(element, "domain") || "";
	if (adTitle || adAuthor || adDomain) {
		const adIdentity = normalizeContentText(
			`${adTitle}|${adAuthor}|${adDomain}`,
		);
		if (adIdentity) {
			return `ad:${adIdentity}`;
		}
	}

	return null;
}

export async function extractPostData(
	element: HTMLElement,
): Promise<PostData | null> {
	if (!isRedditPost(element)) {
		return null;
	}

	const title = extractTitle(element);
	const bodyText = extractBodyText(element);
	if (!title && !bodyText) {
		return null;
	}

	const author = extractAuthor(element);
	const subreddit = extractSubreddit(element);
	const postType = extractPostType(element);
	const domain = extractDomain(element);
	const adPost = isAdPost(element);

	const nodes: PostNode[] = [
		{
			id: "root",
			parent_id: null,
			kind: "root",
			text: buildRootNodeText(
				title,
				bodyText,
				subreddit,
				postType,
				domain,
				adPost,
			),
		},
	];

	const attachments = extractAttachmentRefs(element);
	const identity = readPostIdentity(element);
	const deterministicNodeKey = nodes
		.map(
			(node) =>
				`${node.id}|${node.parent_id ?? "null"}|${node.kind}|${node.text}`,
		)
		.join("\n");
	const postId =
		identity || (await derivePostId(author.id, deterministicNodeKey));

	return {
		post_id: postId,
		author_id: author.id,
		author_name: author.name,
		nodes,
		attachments,
	};
}
