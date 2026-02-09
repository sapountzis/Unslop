import { describe, expect, it } from 'bun:test';
import { createStarvationWatchdog } from './starvation-watchdog';

describe('starvation watchdog', () => {
  it('requests recovery when candidates exist but no progress occurs', () => {
    let recovered = 0;
    const watchdog = createStarvationWatchdog(() => {
      recovered += 1;
    });

    watchdog.tick({
      backlogSize: 5,
      processedDelta: 0,
      classifyDelta: 0,
      pendingBatchCount: 0,
      observerLive: true,
    });
    watchdog.tick({
      backlogSize: 6,
      processedDelta: 0,
      classifyDelta: 0,
      pendingBatchCount: 0,
      observerLive: true,
    });

    expect(recovered).toBe(1);
  });

  it('requests recovery when observer is not live even without visible candidates', () => {
    let recovered = 0;
    const watchdog = createStarvationWatchdog(() => {
      recovered += 1;
    });

    watchdog.tick({
      backlogSize: 0,
      processedDelta: 0,
      classifyDelta: 0,
      pendingBatchCount: 0,
      observerLive: false,
    });
    watchdog.tick({
      backlogSize: 0,
      processedDelta: 0,
      classifyDelta: 0,
      pendingBatchCount: 0,
      observerLive: false,
    });

    expect(recovered).toBe(1);
  });

  it('does not request recovery while batch items are pending', () => {
    let recovered = 0;
    const watchdog = createStarvationWatchdog(() => {
      recovered += 1;
    });

    watchdog.tick({
      backlogSize: 5,
      processedDelta: 0,
      classifyDelta: 0,
      pendingBatchCount: 4,
      observerLive: true,
    });
    watchdog.tick({
      backlogSize: 5,
      processedDelta: 0,
      classifyDelta: 0,
      pendingBatchCount: 4,
      observerLive: true,
    });

    expect(recovered).toBe(0);
  });
});
