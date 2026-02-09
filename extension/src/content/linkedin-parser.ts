// extension/src/content/linkedin-parser.ts
import { normalizeContentText, derivePostId } from '../lib/hash';
import { PostAttachment, PostData, PostNode } from '../types';
import { SELECTORS, AUTHOR_PATTERNS } from '../lib/selectors';

/**
 * Check if an element is a LinkedIn feed post
 */
export function isLikelyFeedPostRoot(element: HTMLElement): boolean {
  if (!element.matches(SELECTORS.candidatePostRoot)) {
    return false;
  }

  if (!element.classList.contains('feed-shared-update-v2')) {
    return false;
  }

  const directUrn = element.getAttribute('data-urn');
  if (directUrn?.startsWith('urn:li:aggregate:') || directUrn?.startsWith('urn:li:member:')) {
    return false;
  }

  if (element.querySelector(SELECTORS.recommendationEntity) !== null) {
    return false;
  }

  return (
    element.matches(SELECTORS.postUrn) ||
    element.querySelector(SELECTORS.postUrn) !== null ||
    element.querySelector(SELECTORS.postContent) !== null
  );
}

export function readPostIdentity(element: HTMLElement): string | null {
  const dataId = element.getAttribute('data-id');
  if (dataId) return dataId;

  const directUrn = element.getAttribute('data-urn');
  if (directUrn) return directUrn;

  const urnNode = element.querySelector(SELECTORS.postUrn);
  if (urnNode instanceof HTMLElement) {
    const nestedUrn = urnNode.getAttribute('data-urn');
    if (nestedUrn) return nestedUrn;
  }

  return null;
}

function isFeedPost(element: HTMLElement): boolean {
  return (
    isLikelyFeedPostRoot(element) ||
    element.querySelector(SELECTORS.postUrn) !== null
  );
}

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

function readText(element: { textContent?: string | null } | null | undefined): string {
  return normalizeContentText(element?.textContent ?? '');
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

function extractRootText(element: HTMLElement): string {
  const contentNodes = queryAllElements(element, SELECTORS.postContent);

  for (const node of contentNodes) {
    const closest = (node as unknown as {
      closest?: (selector: string) => Element | null;
    }).closest;
    if (typeof closest === 'function' && closest.call(node, SELECTORS.nestedRepostLinkContainer)) {
      continue;
    }

    const text = readText(node);
    if (text) {
      return text;
    }
  }

  return readText(element.querySelector(SELECTORS.postContent));
}

function extractRepostTexts(element: HTMLElement): string[] {
  const repostBlocks = queryAllElements(
    element,
    `${SELECTORS.nestedRepostLinkContainer} .feed-shared-update-v2__description .update-components-text`
  );

  const normalized = repostBlocks.map(readText).filter(Boolean);
  if (normalized.length > 0) {
    return normalized;
  }

  const fallbackRepostBlocks = queryAllElements(element, SELECTORS.nestedRepostLinkContainer);
  return fallbackRepostBlocks.map(readText).filter(Boolean);
}

function extractAttachmentRefs(element: HTMLElement): PostAttachment[] {
  const attachments: PostAttachment[] = [];

  const imageNodes = queryAllElements(element, SELECTORS.imageNodes);
  let imageOrdinal = 0;
  for (const imageNode of imageNodes) {
    const src = readAttribute(imageNode, 'src');
    if (!src) continue;

    attachments.push({
      node_id: 'root',
      kind: 'image',
      src,
      alt: (readAttribute(imageNode, 'alt') || '').trim(),
      ordinal: imageOrdinal,
    });
    imageOrdinal += 1;
  }

  const documentContainers = queryAllElements(element, SELECTORS.documentContainer);
  const documentIframes = queryAllElements(element, SELECTORS.documentIframe);
  const documentHints = queryAllElements(element, SELECTORS.documentSourceHints).map((hintNode) => {
    return (
      readAttribute(hintNode, 'href') ||
      readAttribute(hintNode, 'src') ||
      readText(hintNode)
    );
  });

  const pdfCount = Math.max(
    documentContainers.length,
    documentIframes.length,
    documentHints.length
  );

  for (let ordinal = 0; ordinal < pdfCount; ordinal += 1) {
    const container = documentContainers[ordinal] ?? null;
    const nestedQuerySelector = (container as unknown as {
      querySelector?: (selector: string) => HTMLElement | null;
    } | null)?.querySelector;
    const nestedIframe =
      typeof nestedQuerySelector === 'function'
        ? nestedQuerySelector.call(container, SELECTORS.documentIframe)
        : null;
    const iframe = nestedIframe ?? documentIframes[ordinal] ?? null;

    const iframeSrc = readAttribute(iframe, 'src') || undefined;
    const containerDataUrl =
      readAttribute(container, 'data-url') ||
      readAttribute(container, 'data-source-url') ||
      undefined;
    const sourceHint = documentHints[ordinal] || documentHints[0] || undefined;

    if (!iframeSrc && !containerDataUrl && !sourceHint) {
      continue;
    }

    attachments.push({
      node_id: 'root',
      kind: 'pdf',
      iframe_src: iframeSrc,
      container_data_url: containerDataUrl,
      source_hint: sourceHint,
      ordinal,
    });
  }

  return attachments;
}

function buildNodes(element: HTMLElement): PostNode[] {
  const rootText = extractRootText(element);
  const repostTexts = extractRepostTexts(element);

  const nodes: PostNode[] = [
    {
      id: 'root',
      parent_id: null,
      kind: 'root',
      text: rootText,
    },
  ];

  repostTexts.forEach((text, index) => {
    nodes.push({
      id: `repost-${index}`,
      parent_id: 'root',
      kind: 'repost',
      text,
    });
  });

  return nodes;
}

/**
 * Extract author ID from LinkedIn URL
 */
function extractAuthorId(href: string): string {
  const profileMatch = href.match(AUTHOR_PATTERNS.profile);
  if (profileMatch?.[1]) {
    return profileMatch[1];
  }

  const companyMatch = href.match(AUTHOR_PATTERNS.company);
  if (companyMatch?.[1]) {
    return `company-${companyMatch[1]}`;
  }

  // Fallback: use full href if it exists but doesn't match patterns
  return href || 'unresolved';
}

/**
 * Extract author name from element
 */
function extractAuthorName(element: HTMLElement): string {
  // Try the primary selector for author name
  const nameSpan = element.querySelector(SELECTORS.authorName);

  if (nameSpan?.textContent) {
    const trimmed = nameSpan.textContent.trim();
    // Only use if it looks like a name (not empty, not just symbols)
    if (trimmed && trimmed.length > 0 && /^[A-Za-z\u00C0-\u00FF\s.\-]+$/.test(trimmed)) {
      return trimmed;
    }
  }

  // Fallback: try to extract from aria-label
  const authorLink = element.querySelector(SELECTORS.authorLink);
  const ariaLabel = authorLink?.getAttribute('aria-label');
  if (ariaLabel) {
    // aria-label format: "View: Name • ...". Extract just the name.
    const match = ariaLabel.match(/View:\s*([^•]+)/);
    if (match?.[1]) {
      return match[1].trim();
    }
  }

  return 'Unknown';
}

/**
 * Extract post data from a LinkedIn post element
 */
export async function extractPostData(element: HTMLElement): Promise<PostData | null> {
  if (!isFeedPost(element)) {
    return null;
  }

  // Try to get post ID from data-urn attribute
  const urnElement = element.querySelector(SELECTORS.postUrn) || element;
  const postId = urnElement.getAttribute('data-urn');

  // Extract author info
  const authorLink = element.querySelector(SELECTORS.authorLink);
  const href = authorLink?.getAttribute('href') || '';
  const authorId = extractAuthorId(href);
  const authorName = extractAuthorName(element);

  const nodes = buildNodes(element);
  const attachments = extractAttachmentRefs(element);

  const deterministicNodeKey = nodes
    .map((node) => `${node.id}|${node.parent_id ?? 'null'}|${node.kind}|${node.text}`)
    .join('\n');

  const finalPostId = postId || await derivePostId(authorId, deterministicNodeKey);

  return {
    post_id: finalPostId,
    author_id: authorId,
    author_name: authorName,
    nodes,
    attachments,
  };
}
