import { describe, expect, it } from 'bun:test';
import { createAttachmentController } from './attachment-controller';

describe('navigation regression: notifications -> home', () => {
  it('reattaches lifecycle when route becomes feed again', () => {
    const feedRoot = { isConnected: true } as Element;
    const feedAttachRoutes: string[] = [];

    const controller = createAttachmentController({
      isRouteEligible: (routeKey) => routeKey.startsWith('/feed/'),
      findFeedRoot: () => feedRoot,
      attachFeedObserver: ({ routeKey }) => {
        feedAttachRoutes.push(routeKey);
        return { disconnect: () => undefined };
      },
      attachBodyObserver: () => ({ disconnect: () => undefined }),
    });

    controller.ensureAttached({ routeKey: '/feed/' });
    controller.ensureAttached({ routeKey: '/notifications/' });
    controller.ensureAttached({ routeKey: '/feed/' });

    expect(feedAttachRoutes).toEqual(['/feed/', '/feed/']);
    expect(controller.getState().feedObserverActive).toBe(true);
  });
});
