// X (Twitter) DOM selectors

export const SELECTORS = {
    // Feed container
    feed: '[data-testid="primaryColumn"] section[role="region"], [data-testid="primaryColumn"]',

    // Tweet article container
    candidatePostRoot: 'article[data-testid="tweet"]',
    // The cell wrapper around each tweet in the timeline
    renderPostRoot: '[data-testid="cellInnerDiv"]:has(article[data-testid="tweet"])',

    // Tweet content
    tweetText: '[data-testid="tweetText"]',

    // Author info
    authorHandle: '[data-testid="User-Name"] a[href^="/"]',
    authorDisplayName: '[data-testid="User-Name"] span',

    // Tweet link (for identity)
    tweetLink: 'a[href*="/status/"]',

    // Images
    imageNodes: '[data-testid="tweetPhoto"] img',

    // Quote tweets
    quoteTweet: '[data-testid="quoteTweet"]',
} as const;
