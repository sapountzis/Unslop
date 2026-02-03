// extension/src/content/linkedin-parser.ts
import { normalizeContentText, derivePostId } from '../lib/hash';
import { PostData } from '../types';

/**
 * Check if an element is a LinkedIn feed post
 */
function isFeedPost(element: HTMLElement): boolean {
  // LinkedIn feed posts typically have specific data attributes or class names
  // This is a simplified check - adjust based on actual DOM structure
  return (
    element.hasAttribute('data-urn') ||
    element.classList.contains('feed-shared-update-v2') ||
    element.querySelector('[data-urn]') !== null
  );
}

/**
 * Extract post data from a LinkedIn post element
 */
export async function extractPostData(element: HTMLElement): Promise<PostData | null> {
  if (!isFeedPost(element)) {
    return null;
  }

  // Try to get post ID from data-urn attribute
  const urnElement = element.querySelector('[data-urn]') || element;
  const postId = urnElement.getAttribute('data-urn');

  // Extract author info
  const authorLink = element.querySelector('a[href*="/in/"], a[href*="/company/"]');
  const authorId = authorLink?.getAttribute('href') || 'unknown';

  const authorNameElement = element.querySelector(
    '[data-anonymize="person-name"], .feed-shared-author__name'
  );
  const authorName = authorNameElement?.textContent?.trim() || 'Unknown';

  // Extract post content
  const contentElement = element.querySelector(
    '.feed-shared-text, .feed-shared-update-v2__description, [data-anonymize="text"]'
  );
  const contentText = normalizeContentText(
    contentElement?.textContent || ''
  );

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
 * Apply a decision to a post element
 */
export function applyDecision(
  element: HTMLElement,
  decision: 'keep' | 'dim' | 'hide'
): void {
  // Mark element to avoid reprocessing
  if (element.hasAttribute('data-unslop-processed')) {
    return;
  }

  element.setAttribute('data-unslop-processed', 'true');

  switch (decision) {
    case 'keep':
      // No changes
      break;

    case 'dim':
      element.style.opacity = '0.35';
      element.setAttribute('data-unslop-decision', 'dim');

      // Add a restore button header
      const dimHeader = document.createElement('div');
      dimHeader.style.cssText = 'padding: 4px 8px; margin-bottom: 4px; font-size: 11px; color: #666; background: #fff; border: 1px solid #eee; border-radius: 4px; cursor: pointer; display: flex; justify-content: space-between; align-items: center; width: fit-content;';
      dimHeader.innerHTML = '<span>Unslop: Low quality post</span> <span style="margin-left:8px; color: #0a66c2; font-weight:600;">Restore</span>';

      dimHeader.addEventListener('click', (e) => {
        e.stopPropagation();
        element.style.opacity = '1';
        dimHeader.remove();
        // Keep the processed attribute so we don't re-dim it
      });

      // Insert inside the element at the top
      element.prepend(dimHeader);
      break;

    case 'hide':
      // Don't remove from DOM, just hide visually to preserve state
      element.style.display = 'none';
      element.setAttribute('data-unslop-decision', 'hide');

      const stub = document.createElement('div');
      stub.textContent = 'Unslop hid a post · Show';
      stub.style.cssText = 'padding: 12px; color: #666; background: #f9f9f9; cursor: pointer; font-size: 12px; margin: 8px 0; border-radius: 8px; text-align: center;';

      stub.addEventListener('click', (e) => {
        e.stopPropagation();
        element.style.display = ''; // Restore visibility
        stub.remove();
        // Keep the processed attribute so we don't re-hide it
      });

      // Insert stub before the hidden element
      element.parentElement?.insertBefore(stub, element);
      break;
  }
}
