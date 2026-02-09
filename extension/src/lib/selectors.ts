// extension/src/lib/selectors.ts
// Centralized DOM selectors for LinkedIn parsing
// Update these if LinkedIn changes their DOM structure

export const SELECTORS = {
    // Feed container selectors (try in order)
    feed: '.scaffold-finite-scroll__content, main .scaffold-finite-scroll, main',

    // Semantic content card used for extraction/classification.
    candidatePostRoot: '.feed-shared-update-v2[role="article"]',
    // Outer layout owner used for hide/stub/dim rendering.
    renderPostRoot: '[data-finite-scroll-hotkey-item]:has(.feed-shared-update-v2[role="article"])',
    postUrn: '[data-urn^="urn:li:activity:"], [data-urn^="urn:li:share:"]',

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

    // Discovery/recommendation cards (for example "Recommended for you" people suggestions)
    recommendationEntity: '.update-components-feed-discovery-entity, .feed-shared-aggregated-content',

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
    preclassify: 'data-unslop-preclassify',
    identity: 'data-unslop-identity',
} as const;
