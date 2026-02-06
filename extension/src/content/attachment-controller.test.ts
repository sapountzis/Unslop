import { describe, expect, it } from 'bun:test';
import { createAttachmentController } from './attachment-controller';

type MockElement = Element & { isConnected: boolean };

function createFeedElement(): MockElement {
  return { isConnected: true } as MockElement;
}

describe('attachment controller', () => {
  it('reattaches once when stale feed root is replaced on same route', () => {
    let activeFeed: MockElement | null = createFeedElement();

    let feedAttachCalls = 0;
    let bodyAttachCalls = 0;

    const controller = createAttachmentController({
      isRouteEligible: (routeKey) => routeKey.startsWith('/feed/'),
      findFeedRoot: () => activeFeed,
      attachFeedObserver: () => {
        feedAttachCalls += 1;
        return { disconnect: () => undefined };
      },
      attachBodyObserver: () => {
        bodyAttachCalls += 1;
        return { disconnect: () => undefined };
      },
    });

    controller.ensureAttached({ routeKey: '/feed/' });
    expect(feedAttachCalls).toBe(1);
    expect(bodyAttachCalls).toBe(0);

    const oldFeed = activeFeed;
    activeFeed = createFeedElement();
    if (oldFeed) oldFeed.isConnected = false;

    controller.ensureAttached({ routeKey: '/feed/' });
    expect(feedAttachCalls).toBe(2);
    expect(bodyAttachCalls).toBe(0);
  });

  it('does not stack observers when route and feed root are stable', () => {
    const activeFeed = createFeedElement();

    let feedAttachCalls = 0;

    const controller = createAttachmentController({
      isRouteEligible: (routeKey) => routeKey.startsWith('/feed/'),
      findFeedRoot: () => activeFeed,
      attachFeedObserver: () => {
        feedAttachCalls += 1;
        return { disconnect: () => undefined };
      },
      attachBodyObserver: () => ({ disconnect: () => undefined }),
    });

    controller.ensureAttached({ routeKey: '/feed/' });
    controller.ensureAttached({ routeKey: '/feed/' });
    controller.ensureAttached({ routeKey: '/feed/' });

    expect(feedAttachCalls).toBe(1);
  });
});
