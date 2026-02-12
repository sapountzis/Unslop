// X (Twitter) DOM parser
import { normalizeContentText, derivePostId } from '../../lib/hash';
import { PostData, PostNode, PostAttachment } from '../../types';
import { SELECTORS } from './selectors';

function queryAllElements(root: HTMLElement, selector: string): HTMLElement[] {
    const querySelectorAll = (root as unknown as {
        querySelectorAll?: (value: string) => NodeListOf<HTMLElement> | HTMLElement[];
    }).querySelectorAll;

    if (typeof querySelectorAll !== 'function') {
        return [];
    }

    const result = querySelectorAll.call(root, selector);

    if (Array.isArray(result)) {
        return result;
    }

    return Array.from(result);
}

function querySelectorElement(root: HTMLElement, selector: string): HTMLElement | null {
    const querySelector = (root as unknown as {
        querySelector?: (value: string) => HTMLElement | null;
    }).querySelector;

    if (typeof querySelector !== 'function') {
        return null;
    }

    return querySelector.call(root, selector) as HTMLElement | null;
}

function readAttribute(
    element: { getAttribute?: (name: string) => string | null } | null | undefined,
    attribute: string
): string | null {
    if (!element || typeof element.getAttribute !== 'function') {
        return null;
    }

    return element.getAttribute(attribute);
}

function readText(element: { textContent?: string | null } | null | undefined): string {
    return normalizeContentText(element?.textContent ?? '');
}

function contains(
    parent: Partial<HTMLElement> | null | undefined,
    child: Partial<HTMLElement> | null | undefined
): boolean {
    if (!parent || !child) return false;
    if (typeof parent.contains !== 'function') return false;
    return parent.contains(child as unknown as Node);
}

// ---------------------------------------------------------------------------
// MutationObserver-based wait utility (platform-specific, kept local)
// ---------------------------------------------------------------------------

const PHOTO_CONTAINER_SELECTOR = '[data-testid="tweetPhoto"]';
const MEDIA_HINT_SELECTOR =
    '[data-testid="tweetPhoto"], [data-testid="testCondensedMedia"], a[href*="/photo/"]';
const DEFAULT_MEDIA_WAIT_TIMEOUT_MS = 1500;
const MEDIA_WAIT_MIN_GRACE_MS = 120;
const MEDIA_WAIT_QUIET_WINDOW_MS = 120;
const MEDIA_WAIT_NO_HINT_TIMEOUT_MS = 350;
const MEDIA_WAIT_NO_HINT_MIN_GRACE_MS = 40;
const MEDIA_WAIT_NO_HINT_QUIET_WINDOW_MS = 40;
const MEDIA_WAIT_POLL_INTERVAL_MS = 50;

interface WaitScope {
    root: HTMLElement;
}

function parseSrcset(srcset: string | null): string | null {
    if (!srcset) return null;
    const firstCandidate = srcset
        .split(',', 1)[0]
        ?.trim()
        .split(/\s+/, 1)[0];
    return firstCandidate || null;
}

function parseBackgroundImageUrl(value: string | null): string | null {
    if (!value) return null;
    const match = value.match(/url\((['"]?)(.*?)\1\)/i);
    if (!match) return null;
    const extracted = match[2]?.trim();
    return extracted || null;
}

function readImageSourceFromElement(element: HTMLElement | null): string | null {
    if (!element) return null;

    const attrSrc = readAttribute(element, 'src');
    if (attrSrc) return attrSrc;

    const currentSrc = (
        element as unknown as {
            currentSrc?: string;
        }
    ).currentSrc;
    if (typeof currentSrc === 'string' && currentSrc.trim().length > 0) {
        return currentSrc.trim();
    }

    const srcset = parseSrcset(readAttribute(element, 'srcset'));
    if (srcset) return srcset;

    const styleAttr = readAttribute(element, 'style');
    const backgroundUrl = parseBackgroundImageUrl(styleAttr);
    if (backgroundUrl) return backgroundUrl;

    return null;
}

function readImageSourceFromPhotoContainer(container: HTMLElement): string | null {
    const img = querySelectorElement(container, 'img');
    const imgSrc = readImageSourceFromElement(img);
    if (imgSrc) return imgSrc;

    const styledDescendants = queryAllElements(container, '[style*="background-image"]');
    for (const descendant of styledDescendants) {
        const descendantSrc = readImageSourceFromElement(descendant);
        if (descendantSrc) return descendantSrc;
    }

    return readImageSourceFromElement(container);
}

function hasHydratedPhoto(scopes: WaitScope[]): boolean {
    for (const scope of scopes) {
        const containers = queryAllElements(scope.root, PHOTO_CONTAINER_SELECTOR);
        for (const container of containers) {
            if (readImageSourceFromPhotoContainer(container)) {
                return true;
            }
        }
    }
    return false;
}

function hasMediaHint(scopes: WaitScope[]): boolean {
    return scopes.some((scope) => querySelectorElement(scope.root, MEDIA_HINT_SELECTOR) !== null);
}

async function waitForMediaHydration(
    scopes: WaitScope[],
    timeoutMs = DEFAULT_MEDIA_WAIT_TIMEOUT_MS
): Promise<void> {
    if (scopes.length === 0) return;
    if (hasHydratedPhoto(scopes)) return;

    const hintedAtStart = hasMediaHint(scopes);
    const effectiveTimeoutMs = hintedAtStart ? timeoutMs : Math.min(timeoutMs, MEDIA_WAIT_NO_HINT_TIMEOUT_MS);
    const minGraceMs = hintedAtStart ? MEDIA_WAIT_MIN_GRACE_MS : MEDIA_WAIT_NO_HINT_MIN_GRACE_MS;
    const quietWindowMs = hintedAtStart ? MEDIA_WAIT_QUIET_WINDOW_MS : MEDIA_WAIT_NO_HINT_QUIET_WINDOW_MS;

    await new Promise<void>((resolve) => {
        let settled = false;
        let pollTimer: ReturnType<typeof setTimeout> | null = null;
        let timeoutTimer: ReturnType<typeof setTimeout> | null = null;
        let observer: MutationObserver | null = null;
        let lastMutationAt = Date.now();
        const startedAt = Date.now();

        const finish = (): void => {
            if (settled) return;
            settled = true;

            if (pollTimer !== null) {
                clearTimeout(pollTimer);
                pollTimer = null;
            }
            if (timeoutTimer !== null) {
                clearTimeout(timeoutTimer);
                timeoutTimer = null;
            }
            observer?.disconnect();
            resolve();
        };

        const shouldStopWithoutMedia = (): boolean => {
            const now = Date.now();
            const elapsed = now - startedAt;
            if (elapsed < minGraceMs) {
                return false;
            }
            if (hasMediaHint(scopes)) {
                return false;
            }
            return now - lastMutationAt >= quietWindowMs;
        };

        const check = (): void => {
            if (hasHydratedPhoto(scopes)) {
                finish();
                return;
            }

            if (Date.now() - startedAt >= effectiveTimeoutMs || shouldStopWithoutMedia()) {
                finish();
                return;
            }

            pollTimer = setTimeout(check, MEDIA_WAIT_POLL_INTERVAL_MS);
        };

        const MutationObserverCtor = globalThis.MutationObserver;
        if (typeof MutationObserverCtor === 'function') {
            observer = new MutationObserverCtor(() => {
                lastMutationAt = Date.now();
            });

            for (const scope of scopes) {
                try {
                    observer.observe(scope.root, {
                        childList: true,
                        subtree: true,
                        attributes: true,
                        attributeFilter: ['src', 'srcset', 'style'],
                    });
                } catch {
                    // Duck-typed element may not support observe.
                }
            }
        }

        timeoutTimer = setTimeout(finish, effectiveTimeoutMs);
        check();
    });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function readPostIdentity(element: HTMLElement): string | null {
    const tweetLink = element.querySelector(SELECTORS.tweetLink);
    if (tweetLink) {
        const href = tweetLink.getAttribute('href');
        if (href && href.includes('/status/')) return href;
    }
    return null;
}

export async function extractPostData(element: HTMLElement): Promise<PostData | null> {
    if (!element.matches(SELECTORS.candidatePostRoot)) {
        return null;
    }

    // ---------------------------------------------------------------------------
    // 1. Identify scopes (main vs quote) - scoped parsing approach
    // ---------------------------------------------------------------------------

    const tweetTexts = queryAllElements(element, SELECTORS.tweetText);
    if (tweetTexts.length === 0) {
        return null;
    }

    // Check if main text is empty after normalization
    const mainTextRaw = readText(tweetTexts[0]);
    if (!mainTextRaw) {
        return null;
    }

    // Identify quote scope using SELECTORS.quoteTweet (more reliable than closest('[role="link"]'))
    const quoteScope: HTMLElement | null = querySelectorElement(element, SELECTORS.quoteTweet);
    const mainScope: HTMLElement = element;

    // ---------------------------------------------------------------------------
    // 2. Wait for media to load (lazy-load handling)
    // ---------------------------------------------------------------------------

    const waitScopes: WaitScope[] = [{ root: mainScope }];
    if (quoteScope) {
        waitScopes.push({ root: quoteScope });
    }
    await waitForMediaHydration(waitScopes);

    // ---------------------------------------------------------------------------
    // 3. Extract author identity
    // ---------------------------------------------------------------------------

    let authorHandle = 'unknown';
    let authorName = 'Unknown';

    const userNameContainer = mainScope.querySelector('[data-testid="User-Name"]');
    if (userNameContainer) {
        // Handle querySelectorAll duck-type
        const links = (userNameContainer as unknown as {
            querySelectorAll?: (selector: string) => HTMLElement[];
        })?.querySelectorAll?.('a[href^="/"]') ?? [];

        for (const link of links) {
            const href = readAttribute(link, 'href');
            if (href && href.startsWith('/') && !href.includes('/status/')) {
                authorHandle = href.replace(/^\//, '').replace(/\/$/, '') || 'unknown';
                break;
            }
        }

        // Fallback to single querySelector
        if (authorHandle === 'unknown') {
            const singleLink = userNameContainer.querySelector('a[href^="/"]');
            const href = readAttribute(singleLink, 'href');
            if (href && href.startsWith('/') && !href.includes('/status/')) {
                authorHandle = href.replace(/^\//, '').replace(/\/$/, '') || 'unknown';
            }
        }

        const nameSpan = userNameContainer.querySelector('span');
        if (nameSpan?.textContent) {
            const trimmed = nameSpan.textContent.trim();
            if (trimmed.length > 0) {
                authorName = trimmed;
            }
        }
    }

    // ---------------------------------------------------------------------------
    // 4. Extract text content using containment-based bucketing
    // ---------------------------------------------------------------------------

    // Bucket text blocks into root vs quote based on containment in quoteScope
    const nodes: PostNode[] = [];
    let rootText = '';
    let quoteText = '';

    for (const block of tweetTexts) {
        if (quoteScope && contains(quoteScope, block)) {
            quoteText = readText(block);
        } else {
            rootText = readText(block);
        }
    }

    nodes.push({
        id: 'root',
        parent_id: null,
        kind: 'root',
        text: rootText,
    });

    if (quoteScope && quoteText) {
        nodes.push({
            id: 'repost-0',
            parent_id: 'root',
            kind: 'repost',
            text: quoteText,
        });
    }

    // ---------------------------------------------------------------------------
    // 5. Extract attachments with proper node_id assignment
    // ---------------------------------------------------------------------------

    const attachments: PostAttachment[] = [];

    // Helper to extract media from a specific scope
    function extractMediaFromScope(scope: HTMLElement, nodeId: string): void {
        const photoContainers = queryAllElements(scope, PHOTO_CONTAINER_SELECTOR);
        let ordinal = 0;

        for (const container of photoContainers) {

            // If parsing root, skip containers that belong to quote scope
            // Use direct containment check (not closest) to avoid matching image wrapper <a role="link">
            if (quoteScope && nodeId === 'root' && contains(quoteScope, container)) {
                continue;
            }

            const img = querySelectorElement(container, 'img');
            const src = readImageSourceFromPhotoContainer(container);
            if (!src) continue;

            attachments.push({
                node_id: nodeId,
                kind: 'image',
                src,
                alt: (readAttribute(img, 'alt') || '').trim(),
                ordinal,
            });
            ordinal += 1;
        }
    }

    extractMediaFromScope(mainScope, 'root');

    if (quoteScope) {
        extractMediaFromScope(quoteScope, 'repost-0');
    }

    // ---------------------------------------------------------------------------
    // 6. Derive post_id and return
    // ---------------------------------------------------------------------------

    const identity = readPostIdentity(element);
    const deterministicNodeKey = nodes
        .map((node) => `${node.id}|${node.parent_id ?? 'null'}|${node.kind}|${node.text}`)
        .join('\n');
    const postId = identity || await derivePostId(authorHandle, deterministicNodeKey);

    return {
        post_id: postId,
        author_id: authorHandle,
        author_name: authorName,
        nodes,
        attachments,
    };
}
