export type WatchdogInput = {
  candidatesVisible: number;
  processedDelta: number;
  classifyDelta: number;
  observerLive: boolean;
};

export function createStarvationWatchdog(onRecover: () => void, threshold = 2) {
  let stalledTicks = 0;

  return {
    tick(input: WatchdogInput): void {
      if (!input.observerLive) {
        stalledTicks += 1;
        if (stalledTicks >= threshold) {
          stalledTicks = 0;
          onRecover();
        }
        return;
      }

      const hasCandidates = input.candidatesVisible > 0;
      const hasProgress = input.processedDelta > 0 || input.classifyDelta > 0;

      if (!hasCandidates || hasProgress) {
        stalledTicks = 0;
        return;
      }

      stalledTicks += 1;
      if (stalledTicks >= threshold) {
        stalledTicks = 0;
        onRecover();
      }
    },
    reset(): void {
      stalledTicks = 0;
    },
  };
}
