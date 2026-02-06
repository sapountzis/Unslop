import { describe, expect, it } from 'bun:test';
import { routeKeyFromUrl, shouldFilterRoute } from './route-detector';

describe('route detector', () => {
  it('enables filtering only on feed routes', () => {
    expect(shouldFilterRoute('https://www.linkedin.com/feed/')).toBe(true);
    expect(shouldFilterRoute('https://www.linkedin.com/notifications/')).toBe(false);
  });

  it('normalizes route key for lifecycle transitions', () => {
    expect(routeKeyFromUrl('https://www.linkedin.com/feed/?x=1')).toBe('/feed/');
  });
});
