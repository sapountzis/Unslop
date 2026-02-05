// extension/src/content/linkedin-parser.ts
import { normalizeContentText, derivePostId } from '../lib/hash';
import { PostData, Decision } from '../types';
import { decisionCache } from '../lib/storage';
import { SELECTORS, AUTHOR_PATTERNS, ATTRIBUTES } from '../lib/selectors';

/**
 * Check if an element is a LinkedIn feed post
 */
function isFeedPost(element: HTMLElement): boolean {
  return (
    element.hasAttribute('data-urn') ||
    element.classList.contains('feed-shared-update-v2') ||
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
  return href || 'unknown';
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

/**
 * Create the dim header element
 */
function createDimHeader(element: HTMLElement, postId?: string): HTMLElement {
  const header = document.createElement('div');
  header.className = 'unslop-dim-header';
  header.innerHTML = `
    <span class="unslop-dim-header-text">Unslop: Low quality post</span>
    <span class="unslop-dim-header-action">Restore</span>
  `;

  header.addEventListener('click', async (e) => {
    e.stopPropagation();
    element.style.opacity = '1';
    header.remove();
    // Save user choice to cache (priority over server)
    if (postId) {
      await decisionCache.set(postId, 'keep', 'cache');
    }
  });

  return header;
}

/**
 * Create the hidden post stub element
 */
function createHiddenStub(element: HTMLElement, postId?: string): HTMLElement {
  const stub = document.createElement('div');
  stub.className = 'unslop-hidden-stub';
  stub.textContent = 'Unslop hid a post · Show';

  stub.addEventListener('click', async (e) => {
    e.stopPropagation();
    element.style.display = ''; // Restore visibility
    stub.remove();
    // Save user choice to cache (priority over server)
    if (postId) {
      await decisionCache.set(postId, 'keep', 'cache');
    }
  });

  return stub;
}

/**
 * Apply a decision to a post element
 */
export function applyDecision(
  element: HTMLElement,
  decision: Decision,
  postId?: string
): void {
  // Mark element to avoid reprocessing
  if (element.hasAttribute(ATTRIBUTES.processed)) {
    return;
  }

  element.setAttribute(ATTRIBUTES.processed, 'true');

  switch (decision) {
    case 'keep':
      // No changes
      break;

    case 'dim':
      element.style.opacity = '0.35';
      element.setAttribute(ATTRIBUTES.decision, 'dim');
      element.prepend(createDimHeader(element, postId));
      break;

    case 'hide':
      // delete element
      element.remove();
      // element.style.display = 'none';
      // element.setAttribute(ATTRIBUTES.decision, 'hide');
      // element.parentElement?.insertBefore(createHiddenStub(element, postId), element);
      // break;
  }
}
