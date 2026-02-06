export type FeedLifecycleState = {
  generation: number;
  attached: boolean;
  feedSelector: string | null;
  routeKey: string;
};

export function createFeedLifecycle() {
  let generation = 0;
  let attached = false;
  let feedSelector: string | null = null;
  let routeKey = '';

  return {
    attach(selector: string, route = ''): number {
      generation += 1;
      attached = true;
      feedSelector = selector;
      routeKey = route;
      return generation;
    },
    detach(): void {
      attached = false;
      feedSelector = null;
      routeKey = '';
    },
    isCurrent(gen: number): boolean {
      return attached && gen === generation;
    },
    getState(): FeedLifecycleState {
      return { generation, attached, feedSelector, routeKey };
    },
  };
}
