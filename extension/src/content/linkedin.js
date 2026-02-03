// extension/src/content/linkedin.ts
import { extractPostData, applyDecision } from './linkedin-parser';
// Track posts we've already classified
const processedPosts = new Set();
/**
 * Classify a single post
 */
async function classifyPost(postData) {
    try {
        const response = await chrome.runtime.sendMessage({
            type: 'CLASSIFY_POST',
            post: postData,
        });
        return response.decision || 'keep';
    }
    catch (err) {
        console.error('Classification failed:', err);
        return 'keep';
    }
}
/**
 * Process a post element
 */
async function processPost(element) {
    const postData = await extractPostData(element);
    if (!postData) {
        return;
    }
    // Skip if already processed
    if (processedPosts.has(postData.post_id)) {
        return;
    }
    processedPosts.add(postData.post_id);
    // Check if extension is enabled
    const storage = await chrome.storage.sync.get('enabled');
    if (storage.enabled === false) {
        return;
    }
    // Get classification
    const decision = await classifyPost(postData);
    // Apply decision
    applyDecision(element, decision);
}
/**
 * Scan the document for new posts
 */
function scanForPosts() {
    // Find potential post elements
    const postElements = document.querySelectorAll('[data-urn], .feed-shared-update-v2');
    Array.from(postElements).forEach((element) => {
        if (element instanceof HTMLElement) {
            processPost(element);
        }
    });
}
// Set up MutationObserver to detect new posts
const observer = new MutationObserver((mutations) => {
    Array.from(mutations).forEach((mutation) => {
        Array.from(mutation.addedNodes).forEach((node) => {
            if (node instanceof HTMLElement) {
                // Check if this node or its children are posts
                if (node.matches('[data-urn], .feed-shared-update-v2')) {
                    processPost(node);
                }
                else {
                    const childPosts = node.querySelectorAll('[data-urn], .feed-shared-update-v2');
                    Array.from(childPosts).forEach((post) => {
                        if (post instanceof HTMLElement) {
                            processPost(post);
                        }
                    });
                }
            }
        });
    });
});
// Start observing
function startObserving() {
    const feedContainer = document.querySelector('.scaffold-finite-scroll__content, .feed-shared-update-v2__container, main');
    if (feedContainer) {
        observer.observe(feedContainer, {
            childList: true,
            subtree: true,
        });
    }
    // Initial scan
    scanForPosts();
}
// Wait for page to be ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startObserving);
}
else {
    startObserving();
}
// Re-scan periodically (fallback)
setInterval(scanForPosts, 5000);
