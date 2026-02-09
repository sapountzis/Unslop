import { describe, expect, it } from 'bun:test';
import { createRenderCommitPipeline } from './render-commit-pipeline';
import { VisibilityIndex } from './visibility-index';

class MockElement {
  public isConnected = true;
  public order = 0;
  public identity = '';

  constructor(order: number, identity: string) {
    this.order = order;
    this.identity = identity;
  }

  compareDocumentPosition(other: MockElement): number {
    if (this.order < other.order) return 4;
    if (this.order > other.order) return 2;
    return 0;
  }
}

type MockHTMLElement = MockElement & HTMLElement;

type MutableVisibilityState = {
  snapshot: boolean;
  visible: boolean;
};

function createVisibilityStub(state: MutableVisibilityState): VisibilityIndex {
  return {
    observe: () => undefined,
    unobserve: () => undefined,
    hasSnapshot: () => state.snapshot,
    isCurrentlyVisible: () => state.visible,
    clear: () => undefined,
    size: () => 0,
  };
}

describe('zen UX regressions', () => {
  it('ignores stale classification results when a node identity changes before commit', () => {
    const applied: string[] = [];
    const visibilityState: MutableVisibilityState = { snapshot: true, visible: false };
    const post = new MockElement(1, 'urn:li:activity:A') as MockHTMLElement;

    const pipeline = createRenderCommitPipeline({
      render: (_element, _decision, postId) => {
        applied.push(postId ?? 'missing');
      },
      visibility: createVisibilityStub(visibilityState),
      requestAnimationFrame: () => 1,
      cancelAnimationFrame: () => undefined,
    });

    pipeline.enqueue({
      renderRoot: post,
      decision: 'hide',
      postId: 'urn:li:activity:A',
      hideMode: 'collapse',
      isStillValid: ({ renderRoot, postId }) => {
        const current = (renderRoot as MockHTMLElement).identity;
        return current === postId;
      },
    });

    post.identity = 'urn:li:activity:B';
    pipeline.flushNow();

    expect(applied).toEqual([]);
  });

  it('defers collapse for in-viewport hide decisions until offscreen', () => {
    const applied: string[] = [];
    const visibilityState: MutableVisibilityState = { snapshot: true, visible: true };
    const post = new MockElement(1, 'urn:li:activity:1') as MockHTMLElement;

    const pipeline = createRenderCommitPipeline({
      render: (_element, _decision, postId) => {
        applied.push(postId ?? 'missing');
      },
      visibility: createVisibilityStub(visibilityState),
      requestAnimationFrame: () => 1,
      cancelAnimationFrame: () => undefined,
    });

    pipeline.enqueue({
      renderRoot: post,
      decision: 'hide',
      postId: 'urn:li:activity:1',
      hideMode: 'collapse',
    });
    pipeline.flushNow();

    expect(applied).toEqual([]);
    expect(pipeline.size()).toBe(1);

    visibilityState.visible = false;
    pipeline.requestFlush();
    pipeline.flushNow();

    expect(applied).toEqual(['urn:li:activity:1']);
    expect(pipeline.size()).toBe(0);
  });

  it('defers collapse for hide decisions outside the commit band until near viewport', () => {
    const applied: string[] = [];
    const visibilityState: MutableVisibilityState = { snapshot: true, visible: false };
    const post = new MockElement(1, 'urn:li:activity:2') as MockHTMLElement;
    let withinCommitBand = false;

    const pipeline = createRenderCommitPipeline({
      render: (_element, _decision, postId) => {
        applied.push(postId ?? 'missing');
      },
      visibility: createVisibilityStub(visibilityState),
      isWithinCommitBand: () => withinCommitBand,
      requestAnimationFrame: () => 1,
      cancelAnimationFrame: () => undefined,
    });

    pipeline.enqueue({
      renderRoot: post,
      decision: 'hide',
      postId: 'urn:li:activity:2',
      hideMode: 'collapse',
    });
    pipeline.flushNow();

    expect(applied).toEqual([]);
    expect(pipeline.size()).toBe(1);

    withinCommitBand = true;
    pipeline.requestFlush();
    pipeline.flushNow();

    expect(applied).toEqual(['urn:li:activity:2']);
    expect(pipeline.size()).toBe(0);
  });
});
