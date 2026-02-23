// X (Twitter) DOM parser — semantic/attribute selectors only (no data-testid)
import { derivePostId, normalizeContentText } from "../../lib/hash";
import { readBestImageSourceWithAncestors } from "../../lib/imageSource";
import { waitForMediaHydration } from "../../lib/mediaHydration";
import type { PostAttachment, PostData } from "../../types";

const TWEET_LINK = 'a[href*="/status/"]';
const QUOTE_TWEET = '[role="link"][tabindex="0"]';
const IMAGE_SELECTOR = "img";
const MEDIA_HINT = 'img, video, a[href*="/photo/"]';

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

	return element.getAttribute(attribute);
}

function contains(
	parent: Partial<HTMLElement> | null | undefined,
	child: Partial<HTMLElement> | null | undefined,
): boolean {
	if (!parent || !child) return false;
	if (typeof parent.contains !== "function") return false;
	return parent.contains(child as unknown as Node);
}

function getAllDescendants(root: HTMLElement): HTMLElement[] {
	const result: HTMLElement[] = [];
	function traverse(node: Node | HTMLElement): void {
		if (node instanceof HTMLElement) {
			result.push(node);
		}
		// Try to traverse children - handle both real DOM nodes and test mocks
		const children = (node as unknown as { childNodes?: NodeList }).childNodes;
		if (children && children.length > 0) {
			for (let i = 0; i < children.length; i++) {
				const child = children[i];
				if (child) {
					traverse(child);
				}
			}
		}
	}
	try {
		traverse(root);
	} catch {
		// If traversal fails (e.g., in test mocks without proper DOM structure),
		// return empty array - the code will fall back to querySelector-based checks
		// for backward compatibility in test environments
	}
	return result;
}

function isPhotoLink(element: HTMLElement): boolean {
	const tagName = (element.tagName ?? "").toLowerCase();
	if (tagName !== "a") return false;
	const href = readAttribute(element, "href");
	return href !== null && href.includes("/photo/");
}

function findPhotoLinks(root: HTMLElement): HTMLElement[] {
	const allElements = getAllDescendants(root);
	if (allElements.length > 0) {
		return allElements.filter(isPhotoLink);
	}
	// Fallback for test compatibility when traversal doesn't work
	return queryAllElements(root, 'a[href*="/photo/"]');
}

function findImagesInElement(element: HTMLElement): HTMLElement[] {
	const allElements = getAllDescendants(element);
	if (allElements.length > 0) {
		return allElements.filter((el) => {
			const tagName = (el.tagName ?? "").toLowerCase();
			return tagName === "img";
		});
	}
	// Fallback for test compatibility when traversal doesn't work
	return queryAllElements(element, "img");
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function readPostIdentity(element: HTMLElement): string | null {
	const tweetLink = element.querySelector(TWEET_LINK);
	if (tweetLink) {
		const href = tweetLink.getAttribute("href");
		if (href && href.includes("/status/")) return href;
	}
	return null;
}

export function isLikelyTweetRoot(element: HTMLElement): boolean {
	const tagName = (element.tagName ?? "").toLowerCase();
	const hasArticleSemantics =
		tagName === "article" || element.getAttribute("role") === "article";
	if (!hasArticleSemantics) {
		return false;
	}

	const hasText =
		querySelectorElement(element, "p") !== null ||
		querySelectorElement(element, 'a[href*="/status/"]') !== null;
	if (hasText) return true;

	const identity = readPostIdentity(element);
	if (identity) return true;

	// Check for images, videos, or photo links without selectors
	const allDescendants = getAllDescendants(element);

	// If traversal returned results, use them (production path)
	if (allDescendants.length > 0) {
		const hasImg = allDescendants.some(
			(el) => (el.tagName ?? "").toLowerCase() === "img",
		);
		const hasVideo = allDescendants.some(
			(el) => (el.tagName ?? "").toLowerCase() === "video",
		);
		const hasPhotoLink = allDescendants.some(isPhotoLink);
		if (hasImg || hasVideo || hasPhotoLink) {
			return true;
		}
	}

	// Fallback to selector-based checks for test compatibility
	// (when traversal doesn't work due to mock structure)
	return (
		querySelectorElement(element, "img") !== null ||
		querySelectorElement(element, "video") !== null ||
		querySelectorElement(element, 'a[href*="/photo/"]') !== null
	);
}

function extractText(element: HTMLElement): string {
	return normalizeContentText(element.textContent ?? "");
}

export async function extractPostData(
	element: HTMLElement,
): Promise<PostData | null> {
	if (!isLikelyTweetRoot(element)) {
		return null;
	}

	const quoteScope: HTMLElement | null = querySelectorElement(
		element,
		QUOTE_TWEET,
	);
	const mainScope: HTMLElement = element;

	const waitScopes: { root: HTMLElement }[] = [{ root: mainScope }];
	if (quoteScope) {
		waitScopes.push({ root: quoteScope });
	}

	// Find photo links without using selectors
	const photoLinks = findPhotoLinks(element);
	const hasPhotoLinks = photoLinks.length > 0;

	// Wait for media hydration - use general img selector for hint, but we'll check photo links separately
	await waitForMediaHydration(waitScopes, {
		hintSelector: MEDIA_HINT,
	});

	// Additional check: if photo links exist, ensure their images are hydrated
	if (hasPhotoLinks) {
		let hasHydratedPhotoImg = false;
		for (const link of photoLinks) {
			const imgs = findImagesInElement(link);
			for (const img of imgs) {
				if (readBestImageSourceWithAncestors(img)) {
					hasHydratedPhotoImg = true;
					break;
				}
			}
			if (hasHydratedPhotoImg) break;
		}
		// If no hydrated photo img found, wait a bit more (images might still be loading)
		if (!hasHydratedPhotoImg) {
			await new Promise((resolve) => setTimeout(resolve, 200));
			// Check one more time after waiting
			for (const link of photoLinks) {
				const imgs = findImagesInElement(link);
				for (const img of imgs) {
					if (readBestImageSourceWithAncestors(img)) {
						hasHydratedPhotoImg = true;
						break;
					}
				}
				if (hasHydratedPhotoImg) break;
			}
		}
	}

	const text = extractText(element);

	const attachments: PostAttachment[] = [];
	let ordinal = 0;

	function extractMediaFromScope(scope: HTMLElement): void {
		const imgs = queryAllElements(scope, IMAGE_SELECTOR);

		for (const img of imgs) {
			if (scope === mainScope && quoteScope && contains(quoteScope, img)) {
				continue;
			}

			const src = readBestImageSourceWithAncestors(img);
			if (!src) continue;

			attachments.push({
				kind: "image",
				src,
				alt: (readAttribute(img, "alt") || "").trim(),
				ordinal,
			});
			ordinal += 1;
		}
	}

	extractMediaFromScope(mainScope);

	if (quoteScope) {
		extractMediaFromScope(quoteScope);
	}

	const identity = readPostIdentity(element);
	const postId = identity || (await derivePostId(text));

	return {
		post_id: postId,
		text,
		attachments,
	};
}
