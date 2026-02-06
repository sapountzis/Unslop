import { describe, expect, it } from 'bun:test';
import { createStarvationWatchdog } from './starvation-watchdog';

describe('starvation watchdog', () => {
  it('requests recovery when candidates exist but no progress occurs', () => {
    let recovered = 0;
    const watchdog = createStarvationWatchdog(() => {
      recovered += 1;
    });

    watchdog.tick({ candidatesVisible: 5, processedDelta: 0, classifyDelta: 0, observerLive: true });
    watchdog.tick({ candidatesVisible: 6, processedDelta: 0, classifyDelta: 0, observerLive: true });

    expect(recovered).toBe(1);
  });

  it('requests recovery when observer is not live even without visible candidates', () => {
    let recovered = 0;
    const watchdog = createStarvationWatchdog(() => {
      recovered += 1;
    });

    watchdog.tick({ candidatesVisible: 0, processedDelta: 0, classifyDelta: 0, observerLive: false });
    watchdog.tick({ candidatesVisible: 0, processedDelta: 0, classifyDelta: 0, observerLive: false });

    expect(recovered).toBe(1);
  });
});
