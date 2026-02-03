// extension/src/content/linkedin.ts
import { extractPostData, applyDecision } from './linkedin-parser';
import { getCachedDecision, setCachedDecision, cleanupExpiredCache } from '../lib/storage';
// Track posts we've already classified
const processedPosts = new Set();
// Run cleanup on startup
cleanupExpiredCache().catch(console.error);
/**
 * Classify a single post
 */
// Safe processing check
const PROCESSING_ATTR = 'data-unslop-checking';
/**
 * Classify a single post with cache priority
 * Priority: user choice (cache) > server decision
 */
async function classifyPost(postData) {
    const postId = postData.post_id;
    // Check cache first (user choice or previous server decision)
    const cached = await getCachedDecision(postId);
    if (cached) {
        return { decision: cached.decision, source: cached.source };
    }
    // No cache hit, ask server
    try {
        const response = await chrome.runtime.sendMessage({
            type: 'CLASSIFY_POST',
            post: postData,
        });
        const decision = response.decision || 'keep';
        const source = response.source || 'error';
        // Save to cache for next time
        await setCachedDecision(postId, decision, source);
        return { decision, source };
    }
    catch (err) {
        console.error('Classification failed:', err);
        return { decision: 'keep', source: 'error' };
    }
}
/**
 * Process a post element
 */
async function processPost(element) {
    // FAST CHECK 1: Already marked by us in UI?
    if (element.hasAttribute('data-unslop-processed')) {
        return;
    }
    // FAST CHECK 2: Currently checking? (Prevent race conditions)
    if (element.hasAttribute(PROCESSING_ATTR)) {
        return;
    }
    // FAST CHECK 3: Check memory cache
    // We can't check purely by ID yet because we haven't extracted it,
    // but we can check if we've seen this exact element reference before if needed.
    // For now, the DOM attributes are significant enough.
    // Mark as processing immediately to prevent duplicate async calls
    element.setAttribute(PROCESSING_ATTR, 'true');
    try {
        const postData = await extractPostData(element);
        if (!postData) {
            element.removeAttribute(PROCESSING_ATTR);
            return;
        }
        // CHECK 4: Check memory cache for Post ID
        if (processedPosts.has(postData.post_id)) {
            // It is processed, just ensure the UI reflects it if needed.
            // But usually if it's in the set, we've done our job.
            // We might need to re-apply UI if DOM was wiped but ID matches?
            // For safely, let's treat it as new for the logic flow, 
            // but the applyDecision will catch if we want to skip.
            // Actually, if we have a cache hit, we might want to skip network call.
        }
        processedPosts.add(postData.post_id);
        // Check if extension is enabled
        const storage = await chrome.storage.sync.get('enabled');
        if (storage.enabled === false) {
            element.removeAttribute(PROCESSING_ATTR);
            return;
        }
        // Get classification (with cache)
        const { decision } = await classifyPost(postData);
        // Apply decision (pass post_id for user override caching)
        applyDecision(element, decision, postData.post_id);
    }
    catch (e) {
        console.error('Error processing post:', e);
    }
    finally {
        element.removeAttribute(PROCESSING_ATTR);
    }
}
/**
 * Handle new mutations efficiently
 */
function handleMutations(mutations) {
    for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
            if (node instanceof HTMLElement) {
                // Direct match
                if (node.matches('[data-urn], .feed-shared-update-v2')) {
                    processPost(node);
                }
                // Container match - look for children
                else {
                    const posts = node.querySelectorAll('[data-urn], .feed-shared-update-v2');
                    Array.from(posts).forEach(post => {
                        if (post instanceof HTMLElement)
                            processPost(post);
                    });
                }
            }
        }
    }
}
// Global observer for the feed
let feedObserver = null;
const feedSelectors = '.scaffold-finite-scroll__content, .feed-shared-update-v2__container, main';
function attachToFeed() {
    // cleanup existing
    if (feedObserver) {
        feedObserver.disconnect();
    }
    const feedContainer = document.querySelector(feedSelectors);
    if (feedContainer) {
        console.log('[Unslop] Feed container found, attaching observer.');
        feedObserver = new MutationObserver(handleMutations);
        feedObserver.observe(feedContainer, {
            childList: true,
            subtree: true,
        });
        // Initial scan of what's already there
        scanForPosts();
    }
    else {
        console.log('[Unslop] Feed container not found yet, waiting...');
        waitForFeed();
    }
}
/**
 * Watch document body until feed appears
 */
function waitForFeed() {
    const bodyObserver = new MutationObserver((mutations, obs) => {
        const feed = document.querySelector(feedSelectors);
        if (feed) {
            obs.disconnect(); // Stop watching body
            attachToFeed(); // Switch to watching feed
        }
    });
    bodyObserver.observe(document.body, {
        childList: true,
        subtree: true
    });
}
/**
 * Scan the document for new posts
 */
function scanForPosts() {
    const postElements = document.querySelectorAll('[data-urn], .feed-shared-update-v2');
    Array.from(postElements).forEach((element) => {
        if (element instanceof HTMLElement) {
            processPost(element);
        }
    });
}
// Initial Start
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attachToFeed);
}
else {
    attachToFeed();
}
// Backup: If SPA navigation completely wipes the DOM and we lose the container
// We can listen to URL changes or just use a slow poll to check if our observer is still connected/valid
setInterval(() => {
    const feed = document.querySelector(feedSelectors);
    // If we found a feed but our observer is disconnected or looking at a detached node:
    // (We'd need to track the observed node reference to be strictly explicitly correct, 
    // but re-running attachToFeed checks existence).
    // A simple check:
    if (feed && !feed.hasAttribute('data-unslop-feed-observed')) {
        // We can mark the feed container to know we've attached.
        // But simpler: just run attach (which disconnects old) if we suspect drift.
        // OR: just scanForPosts() gently every few seconds to catch edge cases
        scanForPosts();
    }
}, 2000);
