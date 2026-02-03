// extension/src/content/linkedin-parser.ts
import { normalizeContentText, derivePostId } from '../lib/hash';
/**
 * Check if an element is a LinkedIn feed post
 */
function isFeedPost(element) {
    // LinkedIn feed posts typically have specific data attributes or class names
    // This is a simplified check - adjust based on actual DOM structure
    return (element.hasAttribute('data-urn') ||
        element.classList.contains('feed-shared-update-v2') ||
        element.querySelector('[data-urn]') !== null);
}
/**
 * Extract post data from a LinkedIn post element
 */
export async function extractPostData(element) {
    if (!isFeedPost(element)) {
        return null;
    }
    // Try to get post ID from data-urn attribute
    const urnElement = element.querySelector('[data-urn]') || element;
    const postId = urnElement.getAttribute('data-urn');
    // Extract author info
    const authorLink = element.querySelector('a[href*="/in/"], a[href*="/company/"]');
    const authorId = authorLink?.getAttribute('href') || 'unknown';
    const authorNameElement = element.querySelector('[data-anonymize="person-name"], .feed-shared-author__name');
    const authorName = authorNameElement?.textContent?.trim() || 'Unknown';
    // Extract post content
    const contentElement = element.querySelector('.feed-shared-text, .feed-shared-update-v2__description, [data-anonymize="text"]');
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
 * Apply a decision to a post element
 */
export function applyDecision(element, decision) {
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
            // Optional: add small label
            const label = document.createElement('span');
            label.textContent = 'Unslop: dimmed';
            label.style.cssText = 'font-size: 10px; color: #666; display: block;';
            element.insertBefore(label, element.firstChild);
            break;
        case 'hide':
            // Replace with stub
            const stub = document.createElement('div');
            stub.textContent = 'Unslop hid a post · Show';
            stub.style.cssText = 'padding: 8px; color: #666; cursor: pointer; font-size: 12px;';
            stub.addEventListener('click', () => {
                stub.replaceWith(element);
                element.removeAttribute('data-unslop-processed');
            });
            element.replaceWith(stub);
            break;
    }
}
