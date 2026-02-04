// extension/src/lib/selectors.ts
// Centralized DOM selectors for LinkedIn parsing
// Update these if LinkedIn changes their DOM structure

export const SELECTORS = {
    // Feed container selectors (try in order)
    feed: '.scaffold-finite-scroll__content, .feed-shared-update-v2__container, main',

    // Post identification
    post: '[data-urn], .feed-shared-update-v2',
    postUrn: '[data-urn]',

    // Author extraction
    authorLink: 'a[href*="/in/"], a[href*="/company/"]',

    // Author name extraction (multiple fallbacks)
    authorName: [
        '.update-components-actor__title span[aria-hidden="true"]:first-child',
        'span[aria-hidden="true"][class*="visually-hidden"] ~ span[aria-hidden="true"]',
        '[data-anonymize="person-name"]',
    ].join(', '),

    // Post content extraction
    postContent: '.feed-shared-text, .feed-shared-update-v2__description, [data-anonymize="text"]',

    // Auth page JWT meta tag
    jwtMeta: 'meta[name="unslop-jwt"]',
} as const;

// URL patterns for author ID extraction
export const AUTHOR_PATTERNS = {
    profile: /\/in\/([^\/?]+)/,
    company: /\/company\/([^\/?]+)/,
} as const;

// Data attributes used by the extension
export const ATTRIBUTES = {
    processed: 'data-unslop-processed',
    processing: 'data-unslop-checking',
    decision: 'data-unslop-decision',
    feedObserved: 'data-unslop-feed-observed',
} as const;
