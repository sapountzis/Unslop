// LinkedIn DOM selectors — extracted from lib/selectors.ts

export const SELECTORS = {
    // Feed container (try in order)
    feed: '.scaffold-finite-scroll__content, main .scaffold-finite-scroll, main',

    // Semantic content card used for extraction/classification
    candidatePostRoot: '.feed-shared-update-v2[role="article"]',
    // Outer layout owner used for keep/hide rendering
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
    nestedRepostLinkContainer: '.update-components-mini-update-v2__link-to-details-page',
    imageNodes: '.update-components-image__image',
    documentContainer: '.update-components-document__container',
    documentIframe: '.document-s-container__document-element',
    documentSourceHints: [
        '[class*="feedshare-document"]',
        '[data-test-id*="feedshare-document"]',
        '[href*="feedshare-document"]',
        '[src*="feedshare-document"]',
    ].join(', '),

    // Discovery/recommendation cards
    recommendationEntity: '.update-components-feed-discovery-entity, .feed-shared-aggregated-content',
} as const;

// URL patterns for author ID extraction
export const AUTHOR_PATTERNS = {
    profile: /\/in\/([^\/?]+)/,
    company: /\/company\/([^\/?]+)/,
} as const;
