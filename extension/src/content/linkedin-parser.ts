// extension/src/content/linkedin-parser.ts
import { normalizeContentText, derivePostId } from '../lib/hash';
import { PostData } from '../types';
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

  // Extract post content
  const contentElement = element.querySelector(SELECTORS.postContent);
  const contentText = normalizeContentText(contentElement?.textContent || '');

  // Derive post_id if we don't have a native one
  const finalPostId = postId || await derivePostId(authorId, contentText);

  return {
    post_id: finalPostId,
    author_id: authorId,
    author_name: authorName,
    content_text: contentText,
  };
}
