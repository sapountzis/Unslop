export type WatchdogInput = {
  backlogSize: number;
  processedDelta: number;
  classifyDelta: number;
  pendingBatchCount: number;
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

      // Pending batch classification is expected to sit briefly (windowing + API/NDJSON latency).
      // Treat it as active work, not starvation, to avoid recovery loops that reset the feed.
      if (input.pendingBatchCount > 0) {
        stalledTicks = 0;
        return;
      }

      const hasBacklog = input.backlogSize > 0;
      const hasProgress = input.processedDelta > 0 || input.classifyDelta > 0;

      if (!hasBacklog || hasProgress) {
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
