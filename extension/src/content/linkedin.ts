// extension/src/content/linkedin.ts
import { extractPostData, applyDecision } from './linkedin-parser';
import { PostData, Decision, Source } from '../types';
import { decisionCache, userData } from '../lib/storage';
import { enqueueBatch, handleBatchResult } from './batch-queue';
import { SELECTORS, ATTRIBUTES } from '../lib/selectors';
import '../styles/content.css';

// Track posts we've already classified
const processedPosts = new Set<string>();

// Run cleanup on startup
decisionCache.cleanupExpired().catch(console.error);

// Listen for batch results from background
chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === 'CLASSIFY_BATCH_RESULT') {
    handleBatchResult(message.item);
  }
});

// ============================================================================
// Guard Functions (Pure, testable checks)
// ============================================================================

/**
 * Check if element should be skipped (already processed or currently processing)
 */
function shouldSkipElement(element: HTMLElement): boolean {
  return (
    element.hasAttribute(ATTRIBUTES.processed) ||
    element.hasAttribute(ATTRIBUTES.processing)
  );
}

/**
 * Check if filtering is enabled
 */
async function isFilteringEnabled(): Promise<boolean> {
  return userData.isEnabled();
}

/**
 * Check if post was already processed by ID
 */
function isPostAlreadyProcessed(postId: string): boolean {
  return processedPosts.has(postId);
}

// ============================================================================
// Classification Logic
// ============================================================================

/**
 * Classify a single post with cache priority
 * Priority: user choice (cache) > server decision
 */
async function classifyPost(postData: PostData): Promise<{ decision: Decision; source: Source }> {
  const postId = postData.post_id;
  console.debug('[Unslop][classify] start', { postId });

  // Check cache first (user choice or previous server decision)
  const cached = await decisionCache.get(postId);
  if (cached) {
    console.debug('[Unslop][classify] cache-return', { postId, decision: cached.decision });
    return { decision: cached.decision, source: cached.source };
  }

  // No cache hit, ask server via batch queue
  try {
    const { decision, source } = await enqueueBatch(postData);
    console.debug('[Unslop][classify] response', { postId, decision, source });

    // Save to cache for next time
    await decisionCache.set(postId, decision, source);

    return { decision, source };
  } catch (err) {
    console.error('Classification failed:', err);
    return { decision: 'keep', source: 'error' };
  }
}

// ============================================================================
// Post Processing Pipeline
// ============================================================================

/**
 * Mark element as being processed
 */
function markProcessing(element: HTMLElement): void {
  element.setAttribute(ATTRIBUTES.processing, 'true');
}

/**
 * Unmark element processing state
 */
function unmarkProcessing(element: HTMLElement): void {
  element.removeAttribute(ATTRIBUTES.processing);
}

/**
 * Process a single post element
 * Broken into clear steps for readability
 */
async function processPost(element: HTMLElement): Promise<void> {
  // Step 1: Fast guard checks
  if (shouldSkipElement(element)) {
    return;
  }

  // Step 2: Mark as processing to prevent race conditions
  markProcessing(element);

  try {
    // Step 3: Extract post data
    const postData = await extractPostData(element);
    if (!postData) {
      return;
    }

    // Step 4: Track by post ID
    if (isPostAlreadyProcessed(postData.post_id)) {
      return;
    }
    processedPosts.add(postData.post_id);

    // Step 5: Check if filtering is enabled
    if (!await isFilteringEnabled()) {
      return;
    }

    // Step 6: Classify and apply decision
    const { decision } = await classifyPost(postData);
    applyDecision(element, decision, postData.post_id);

  } catch (e) {
    console.error('Error processing post:', e);
  } finally {
    unmarkProcessing(element);
  }
}

// ============================================================================
// DOM Observation
// ============================================================================

/**
 * Handle new mutations efficiently
 */
function handleMutations(mutations: MutationRecord[]): void {
  for (const mutation of mutations) {
    for (const node of mutation.addedNodes) {
      if (node instanceof HTMLElement) {
        // Direct match
        if (node.matches(SELECTORS.post)) {
          processPost(node);
        }
        // Container match - look for children
        else {
          const posts = node.querySelectorAll(SELECTORS.post);
          posts.forEach((post) => {
            if (post instanceof HTMLElement) {
              processPost(post);
            }
          });
        }
      }
    }
  }
}

// Global observer for the feed
let feedObserver: MutationObserver | null = null;

/**
 * Attach observer to the feed container
 */
function attachToFeed(): void {
  // Cleanup existing
  if (feedObserver) {
    feedObserver.disconnect();
  }

  const feedContainer = document.querySelector(SELECTORS.feed);

  if (feedContainer) {
    console.log('[Unslop] Feed container found, attaching observer.');
    feedObserver = new MutationObserver(handleMutations);
    feedObserver.observe(feedContainer, {
      childList: true,
      subtree: true,
    });

    // Initial scan of what's already there
    scanForPosts();
  } else {
    console.log('[Unslop] Feed container not found yet, waiting...');
    waitForFeed();
  }
}

/**
 * Watch document body until feed appears
 */
function waitForFeed(): void {
  const bodyObserver = new MutationObserver((mutations, obs) => {
    const feed = document.querySelector(SELECTORS.feed);
    if (feed) {
      obs.disconnect(); // Stop watching body
      attachToFeed();   // Switch to watching feed
    }
  });

  bodyObserver.observe(document.body, {
    childList: true,
    subtree: true,
  });
}

/**
 * Scan the document for new posts
 */
function scanForPosts(): void {
  const postElements = document.querySelectorAll(SELECTORS.post);

  postElements.forEach((element) => {
    if (element instanceof HTMLElement) {
      processPost(element);
    }
  });
}

// ============================================================================
// Initialization & SPA Navigation Handling
// ============================================================================

/**
 * Handle SPA navigation (when LinkedIn changes pages without full reload)
 */
function handleNavigation(): void {
  console.log('[Unslop] Navigation detected, re-attaching to feed.');
  // Give the new page a moment to render
  requestAnimationFrame(() => {
    attachToFeed();
  });
}

/**
 * Set up History API interception for SPA navigation detection
 * This is more efficient than polling
 */
function setupNavigationDetection(): void {
  // Listen for browser back/forward
  window.addEventListener('popstate', handleNavigation);

  // Intercept pushState and replaceState for programmatic navigation
  const originalPushState = history.pushState.bind(history);
  const originalReplaceState = history.replaceState.bind(history);

  history.pushState = function (...args) {
    originalPushState(...args);
    handleNavigation();
  };

  history.replaceState = function (...args) {
    originalReplaceState(...args);
    handleNavigation();
  };
}

// Initial start
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    attachToFeed();
    setupNavigationDetection();
  });
} else {
  attachToFeed();
  setupNavigationDetection();
}
