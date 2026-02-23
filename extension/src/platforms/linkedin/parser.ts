// LinkedIn DOM parser — semantic/attribute selectors only (no classes)
import { normalizeContentText, derivePostId } from "../../lib/hash";
import { PostAttachment, PostData } from "../../types";
import { cleanupLinkedInText } from "./textCleanup";

const URN_SELECTOR =
	'[data-urn^="urn:li:activity:"], [data-urn^="urn:li:share:"]';
const IMAGE_SELECTOR = "img";
const DOCUMENT_IFRAME = "iframe";
const DOCUMENT_HINTS =
	'[href*="feedshare-document"], [src*="feedshare-document"], [data-url], [data-source-url]';

export function isLikelyFeedPostRoot(element: HTMLElement): boolean {
	const hasArticleRole = element.getAttribute("role") === "article";
	const hasUrn =
		element.getAttribute("data-urn")?.startsWith("urn:li:activity:") ||
		element.getAttribute("data-urn")?.startsWith("urn:li:share:");
	if (!hasArticleRole && !hasUrn) {
		return false;
	}

	const directUrn = element.getAttribute("data-urn");
	if (
		directUrn?.startsWith("urn:li:aggregate:") ||
		directUrn?.startsWith("urn:li:member:")
	) {
		return false;
	}

	if (element.querySelector('[data-urn^="urn:li:aggregate:"]') !== null) {
		return false;
	}

	return (
		element.matches(
			'[data-urn^="urn:li:activity:"], [data-urn^="urn:li:share:"]',
		) ||
		element.querySelector(
			'[data-urn^="urn:li:activity:"], [data-urn^="urn:li:share:"]',
		) !== null ||
		element.querySelector('p, [role="text"]') !== null
	);
}

export function readPostIdentity(element: HTMLElement): string | null {
	const dataId = element.getAttribute("data-id");
	if (dataId) return dataId;

	const directUrn = element.getAttribute("data-urn");
	if (directUrn) return directUrn;

	const urnNode = element.querySelector(URN_SELECTOR);
	if (urnNode && typeof urnNode.getAttribute === "function") {
		const nestedUrn = urnNode.getAttribute("data-urn");
		if (nestedUrn) return nestedUrn;
	}

	return null;
}

function isFeedPost(element: HTMLElement): boolean {
	return (
		isLikelyFeedPostRoot(element) ||
		element.querySelector(
			'[data-urn^="urn:li:activity:"], [data-urn^="urn:li:share:"]',
		) !== null ||
		element.querySelector('p, [role="text"]') !== null
	);
}

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

function readText(
	element: { textContent?: string | null } | null | undefined,
): string {
	return normalizeContentText(element?.textContent ?? "");
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

function extractText(element: HTMLElement): string {
	const rawText = element.textContent ?? "";
	const normalized = normalizeContentText(rawText);
	if (!normalized) {
		return "";
	}

	const cleaned = cleanupLinkedInText(rawText);
	if (cleaned.classification === "metadata_only") {
		return "";
	}

	return cleaned.text.length > 0 ? cleaned.text : normalized;
}

function extractAttachmentRefs(element: HTMLElement): PostAttachment[] {
	const attachments: PostAttachment[] = [];

	const imageNodes = queryAllElements(element, IMAGE_SELECTOR);
	let imageOrdinal = 0;
	for (const imageNode of imageNodes) {
		const src = readAttribute(imageNode, "src");
		if (!src) continue;

		attachments.push({
			kind: "image",
			src,
			alt: (readAttribute(imageNode, "alt") || "").trim(),
			ordinal: imageOrdinal,
		});
		imageOrdinal += 1;
	}

	const documentContainers = queryAllElements(
		element,
		"[data-url], [data-source-url]",
	);
	const documentIframes = queryAllElements(element, DOCUMENT_IFRAME);
	const documentHints = queryAllElements(element, DOCUMENT_HINTS).map(
		(hintNode) => {
			return (
				readAttribute(hintNode, "href") ||
				readAttribute(hintNode, "src") ||
				readText(hintNode)
			);
		},
	);

	const pdfCount = Math.max(
		documentContainers.length,
		documentIframes.length,
		documentHints.length,
	);

	for (let ordinal = 0; ordinal < pdfCount; ordinal += 1) {
		const container = documentContainers[ordinal] ?? null;
		const nestedQuerySelector = (
			container as unknown as {
				querySelector?: (selector: string) => HTMLElement | null;
			} | null
		)?.querySelector;
		const nestedIframe =
			typeof nestedQuerySelector === "function"
				? nestedQuerySelector.call(container, DOCUMENT_IFRAME)
				: null;
		const iframe = nestedIframe ?? documentIframes[ordinal] ?? null;

		const iframeSrc = readAttribute(iframe, "src") || undefined;
		const containerDataUrl =
			readAttribute(container, "data-url") ||
			readAttribute(container, "data-source-url") ||
			undefined;
		const sourceHint = documentHints[ordinal] || documentHints[0] || undefined;

		if (!iframeSrc && !containerDataUrl && !sourceHint) {
			continue;
		}

		attachments.push({
			kind: "pdf",
			iframe_src: iframeSrc,
			container_data_url: containerDataUrl,
			source_hint: sourceHint,
			ordinal,
		});
	}

	return attachments;
}

export async function extractPostData(
	element: HTMLElement,
): Promise<PostData | null> {
	if (!isFeedPost(element)) {
		return null;
	}

	const urnElement = element.querySelector(URN_SELECTOR) || element;
	const postId = urnElement.getAttribute("data-urn");

	const text = extractText(element);
	const attachments = extractAttachmentRefs(element);
	if (!text && attachments.length === 0) {
		return null;
	}
	const finalPostId = postId || (await derivePostId(text));

	return {
		post_id: finalPostId,
		text,
		attachments,
	};
}
