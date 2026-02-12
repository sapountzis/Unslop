// Reddit route detection

export function routeKeyFromUrl(url: string): string {
    try {
        const parsed = new URL(url);
        return parsed.pathname.endsWith('/') ? parsed.pathname : `${parsed.pathname}/`;
    } catch {
        return '/';
    }
}

const NON_FEED_PREFIXES = [
    '/user/',
    '/settings/',
    '/message/',
    '/prefs/',
    '/wiki/',
    '/mod/',
];

export function shouldFilterRouteKey(routeKey: string): boolean {
    // Root feed
    if (routeKey === '/') return true;

    // Aggregated feeds
    if (routeKey === '/r/all/' || routeKey === '/r/popular/' || routeKey === '/best/') return true;

    // Reject known non-feed pages
    for (const prefix of NON_FEED_PREFIXES) {
        if (routeKey.startsWith(prefix)) return false;
    }

    // Subreddit feed (e.g. /r/programming/) but not comment pages (/r/programming/comments/...)
    const subredditMatch = routeKey.match(/^\/r\/([^/]+)\/$/);
    if (subredditMatch) return true;

    // Subreddit with sort (e.g. /r/programming/hot/, /r/programming/new/)
    const sortMatch = routeKey.match(/^\/r\/([^/]+)\/(hot|new|rising|top|controversial)\/$/);
    if (sortMatch) return true;

    return false;
}

export function shouldFilterRoute(url: string): boolean {
    const key = routeKeyFromUrl(url);
    return shouldFilterRouteKey(key);
}
