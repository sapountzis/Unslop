export type CounterKey =
  | 'mutations_seen'
  | 'candidates_seen'
  | 'posts_processed'
  | 'classify_sent'
  | 'classify_result'
  | 'process_errors'
  | 'observer_reattach';

export type GaugeKey = 'active_route' | 'active_feed_selector' | 'observer_generation';

type Store = Record<string, number | string>;

export function createRuntimeMetrics() {
  const store: Store = {};

  return {
    inc(key: CounterKey): void {
      const current = store[key];
      store[key] = (typeof current === 'number' ? current : 0) + 1;
    },
    set(key: GaugeKey, value: string | number): void {
      store[key] = value;
    },
    get(key: CounterKey): number {
      const value = store[key];
      return typeof value === 'number' ? value : 0;
    },
    snapshot(): Store {
      return { ...store };
    },
  };
}
