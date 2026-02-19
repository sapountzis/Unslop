// Reddit DOM parser — semantic/attribute selectors only
import { normalizeContentText, derivePostId } from "../../lib/hash";
import { waitForMediaHydration } from "../../lib/mediaHydration";
import { PostAttachment, PostData } from "../../types";

const IMAGE_SELECTOR = "img";
const PERMALINK_SELECTOR = 'a[href*="/comments/"]';

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

function parseSrcset(srcset: string | null): string | null {
	if (!srcset) return null;
	const firstCandidate = srcset.split(",", 1)[0]?.trim().split(/\s+/, 1)[0];
	return firstCandidate || null;
}

function parseBackgroundImageUrl(style: string | null): string | null {
	if (!style?.includes("background-image")) return null;
	const m = style.match(/url\((['"]?)(.*?)\1\)/i);
	return m?.[2]?.trim() ?? null;
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

	const srcset = parseSrcset(readAttribute(element, "srcset"));
	if (srcset) return srcset;

	const bg = parseBackgroundImageUrl(readAttribute(element, "style"));
	if (bg) return bg;

	const parent = element.parentElement;
	if (parent) {
		const styled = queryAllElements(parent, '[style*="background-image"]');
		for (const s of styled) {
			const u = parseBackgroundImageUrl(readAttribute(s, "style"));
			if (u) return u;
		}
		const parentBg = parseBackgroundImageUrl(readAttribute(parent, "style"));
		if (parentBg) return parentBg;
	}
	return null;
}

function extractText(element: HTMLElement): string {
	return normalizeContentText(element.textContent ?? "");
}

export function isLikelyRedditPostRoot(element: HTMLElement): boolean {
	const tagName = (element.tagName ?? "").toLowerCase();
	if (
		tagName === "shreddit-post" ||
		tagName === "shreddit-ad-post" ||
		tagName === "article"
	) {
		return true;
	}

	if (readAttributeFromSelfOrNested(element, "post-title")) {
		return true;
	}

	return (
		querySelectorElement(
			element,
			'[post-title], h2 a, h3 a, a[href*="/comments/"]',
		) !== null
	);
}

const BLOCKED_IMAGE_DOMAINS = [
	"styles.redditmedia.com",
	"emoji.redditmedia.com",
	"thumbs.redditmedia.com",
];

function extractAttachmentRefs(element: HTMLElement): PostAttachment[] {
	const attachments: PostAttachment[] = [];
	const seen = new Set<string>();

	for (const imageNode of queryAllElements(element, IMAGE_SELECTOR)) {
		const src = readImageSource(imageNode);
		if (!src || seen.has(src)) continue;

		try {
			const url = new URL(src);
			if (BLOCKED_IMAGE_DOMAINS.some((d) => url.hostname.includes(d))) continue;
		} catch {
			/* ignore invalid URLs */
		}

		seen.add(src);
		attachments.push({
			kind: "image",
			src,
			alt: (readAttribute(imageNode, "alt") || "").trim(),
			ordinal: attachments.length,
		});
	}

	return attachments;
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

	const commentLink = querySelectorElement(element, PERMALINK_SELECTOR);
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
	if (!isLikelyRedditPostRoot(element)) {
		return null;
	}

	await waitForMediaHydration([{ root: element }]);

	const text = extractText(element);
	const attachments = extractAttachmentRefs(element);
	if (!text && attachments.length === 0) {
		return null;
	}
	const identity = readPostIdentity(element);
	const postId = identity || (await derivePostId(text));

	return {
		post_id: postId,
		text,
		attachments,
	};
}
