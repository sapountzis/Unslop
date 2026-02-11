// Reddit post surface resolution
import { SELECTORS } from './selectors';
import { readPostIdentity } from './parser';
import type { PostSurface } from '../platform';

function isHtmlElement(value: Element | null): value is HTMLElement {
    if (!value) return false;
    return (
        typeof value.getAttribute === 'function' &&
        typeof value.querySelector === 'function' &&
        typeof value.closest === 'function'
    );
}

function findContentRoot(node: HTMLElement): HTMLElement | null {
    if (node.matches(SELECTORS.candidatePostRoot)) {
        return node;
    }

    const closest = node.closest(SELECTORS.candidatePostRoot);
    if (isHtmlElement(closest)) {
        return closest;
    }

    const nested = node.querySelector(SELECTORS.candidatePostRoot);
    if (isHtmlElement(nested)) {
        return nested;
    }

    return null;
}

function resolveRenderRoot(contentRoot: HTMLElement): HTMLElement {
    // Reddit posts are typically self-contained; the content root is the render root
    const renderRoot = contentRoot.closest(SELECTORS.renderPostRoot);
    if (isHtmlElement(renderRoot)) {
        return renderRoot;
    }
    return contentRoot;
}

export function resolvePostSurface(node: HTMLElement): PostSurface | null {
    const contentRoot = findContentRoot(node);
    if (!contentRoot) {
        return null;
    }

    const renderRoot = resolveRenderRoot(contentRoot);
    const identity = readPostIdentity(renderRoot) || readPostIdentity(contentRoot);
    if (!identity) {
        return null;
    }

    // Reddit uses the same root for label mode as hide mode
    const labelRoot = renderRoot;

    return {
        contentRoot,
        renderRoot,
        labelRoot,
        identity,
    };
}
