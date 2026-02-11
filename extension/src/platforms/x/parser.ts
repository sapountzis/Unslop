// X (Twitter) DOM parser
import { normalizeContentText, derivePostId } from '../../lib/hash';
import { PostData, PostNode } from '../../types';
import { SELECTORS } from './selectors';

export function readPostIdentity(element: HTMLElement): string | null {
    const tweetLink = element.querySelector(SELECTORS.tweetLink);
    if (tweetLink) {
        const href = tweetLink.getAttribute('href');
        if (href && href.includes('/status/')) return href;
    }
    return null;
}

function extractTweetText(element: HTMLElement): string {
    const textEl = element.querySelector(SELECTORS.tweetText);
    return normalizeContentText(textEl?.textContent ?? '');
}

function extractAuthorHandle(element: HTMLElement): string {
    const userNameContainer = element.querySelector('[data-testid="User-Name"]');
    if (!userNameContainer) return 'unknown';

    // Try querySelectorAll first; fall back to querySelector for robustness
    if (typeof userNameContainer.querySelectorAll === 'function') {
        const links = userNameContainer.querySelectorAll('a[href^="/"]');
        for (const link of links) {
            const href = link.getAttribute('href');
            if (href && href.startsWith('/') && !href.includes('/status/')) {
                return href.replace(/^\//, '').replace(/\/$/, '') || 'unknown';
            }
        }
    }

    // Fallback: single querySelector
    const singleLink = userNameContainer.querySelector?.('a[href^="/"]');
    if (singleLink) {
        const href = singleLink.getAttribute('href');
        if (href && href.startsWith('/') && !href.includes('/status/')) {
            return href.replace(/^\//, '').replace(/\/$/, '') || 'unknown';
        }
    }

    return 'unknown';
}

function extractAuthorDisplayName(element: HTMLElement): string {
    const userNameContainer = element.querySelector('[data-testid="User-Name"]');
    if (!userNameContainer) return 'Unknown';

    // The display name is typically in the first <span> with actual text
    const span = userNameContainer.querySelector('span');
    if (span?.textContent) {
        const trimmed = span.textContent.trim();
        if (trimmed.length > 0) return trimmed;
    }
    return 'Unknown';
}

function extractQuoteTweetText(element: HTMLElement): string[] {
    const quoteTweet = element.querySelector(SELECTORS.quoteTweet);
    if (!quoteTweet) return [];

    const textEl = quoteTweet.querySelector(SELECTORS.tweetText);
    const text = normalizeContentText(textEl?.textContent ?? '');
    return text ? [text] : [];
}

function isTweetElement(element: HTMLElement): boolean {
    return element.matches(SELECTORS.candidatePostRoot) ||
        element.querySelector(SELECTORS.tweetText) !== null;
}

export async function extractPostData(element: HTMLElement): Promise<PostData | null> {
    if (!isTweetElement(element)) {
        return null;
    }

    const tweetText = extractTweetText(element);
    if (!tweetText) {
        return null;
    }

    const authorHandle = extractAuthorHandle(element);
    const authorName = extractAuthorDisplayName(element);

    const nodes: PostNode[] = [
        {
            id: 'root',
            parent_id: null,
            kind: 'root',
            text: tweetText,
        },
    ];

    const quoteTexts = extractQuoteTweetText(element);
    quoteTexts.forEach((text, index) => {
        nodes.push({
            id: `repost-${index}`,
            parent_id: 'root',
            kind: 'repost',
            text,
        });
    });

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
        attachments: [],
    };
}
