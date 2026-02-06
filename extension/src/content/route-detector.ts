export function routeKeyFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.pathname.endsWith('/') ? parsed.pathname : `${parsed.pathname}/`;
  } catch {
    return '/';
  }
}

export function shouldFilterRouteKey(routeKey: string): boolean {
  return routeKey === '/feed/' || routeKey.startsWith('/feed/');
}

export function shouldFilterRoute(url: string): boolean {
  const key = routeKeyFromUrl(url);
  return shouldFilterRouteKey(key);
}
