import { describe, expect, it } from 'bun:test';
import { createRuntimeMetrics } from './runtime-metrics';

describe('runtime metrics', () => {
  it('tracks counters and snapshots consistently', () => {
    const metrics = createRuntimeMetrics();
    metrics.inc('mutations_seen');
    metrics.inc('mutations_seen');
    metrics.set('active_route', '/feed/');

    const snapshot = metrics.snapshot();
    expect(snapshot.mutations_seen).toBe(2);
    expect(snapshot.active_route).toBe('/feed/');
  });
});
