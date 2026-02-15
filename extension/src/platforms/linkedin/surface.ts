// LinkedIn post surface resolution — extracted from content/post-surface.ts
import { SELECTORS } from "./selectors";
import { isLikelyFeedPostRoot, readPostIdentity } from "./parser";
import type { PostSurface } from "../platform";

function isHtmlElement(value: Element | null): value is HTMLElement {
	if (!value) return false;
	return (
		typeof value.getAttribute === "function" &&
		typeof value.querySelector === "function" &&
		typeof value.closest === "function"
	);
}

function findContentRoot(node: HTMLElement): HTMLElement | null {
	if (isLikelyFeedPostRoot(node)) {
		return node;
	}

	const closest = node.closest(SELECTORS.candidatePostRoot);
	if (isHtmlElement(closest) && isLikelyFeedPostRoot(closest)) {
		return closest;
	}

	const nested = node.querySelector(SELECTORS.candidatePostRoot);
	if (isHtmlElement(nested) && isLikelyFeedPostRoot(nested)) {
		return nested;
	}

	return null;
}

function resolveRenderRoot(contentRoot: HTMLElement): HTMLElement {
	const renderRoot = contentRoot.closest(SELECTORS.renderPostRoot);
	if (isHtmlElement(renderRoot)) {
		return renderRoot;
	}
	return contentRoot;
}

function resolveIdentity(
	contentRoot: HTMLElement,
	renderRoot: HTMLElement,
): string | null {
	const renderIdentity = readPostIdentity(renderRoot);
	if (renderIdentity) return renderIdentity;

	const contentIdentity = readPostIdentity(contentRoot);
	if (contentIdentity) return contentIdentity;

	return null;
}

export function resolvePostSurface(node: HTMLElement): PostSurface | null {
	const contentRoot = findContentRoot(node);
	if (!contentRoot) {
		return null;
	}

	const renderRoot = resolveRenderRoot(contentRoot);
	const identity = resolveIdentity(contentRoot, renderRoot);
	if (!identity) {
		return null;
	}

	// LinkedIn uses the same root for label mode as hide mode
	const labelRoot = renderRoot;

	return {
		contentRoot,
		renderRoot,
		labelRoot,
		identity,
	};
}
