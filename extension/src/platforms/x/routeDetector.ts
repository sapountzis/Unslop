// X (Twitter) route detection

export function routeKeyFromUrl(url: string): string {
	try {
		const parsed = new URL(url);
		return parsed.pathname.endsWith("/")
			? parsed.pathname
			: `${parsed.pathname}/`;
	} catch {
		return "/";
	}
}

const FEED_ROUTE_KEYS = new Set(["/", "/home/", "/explore/"]);

const NON_FEED_PREFIXES = [
	"/settings/",
	"/messages/",
	"/notifications/",
	"/search/",
	"/i/",
	"/compose/",
];

export function shouldFilterRouteKey(routeKey: string): boolean {
	if (FEED_ROUTE_KEYS.has(routeKey)) return true;
	// Reject known non-feed routes
	for (const prefix of NON_FEED_PREFIXES) {
		if (routeKey.startsWith(prefix)) return false;
	}
	// Reject profile pages and other paths (anything like /username/ that isn't a feed route)
	// A profile page is a single-segment path like /elonmusk/
	if (routeKey !== "/" && !FEED_ROUTE_KEYS.has(routeKey)) return false;
	return true;
}
