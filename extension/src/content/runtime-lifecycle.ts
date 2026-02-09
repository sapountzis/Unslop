type CleanupFn = () => void;

export type RuntimeLifecycle = {
  activate: (routeKey: string) => void;
  routeKey: () => string | null;
  isActive: () => boolean;
  registerCleanup: (cleanup: CleanupFn) => void;
  dispose: () => void;
};

function safeRun(cleanup: CleanupFn): void {
  try {
    cleanup();
  } catch (err) {
    console.error('[Unslop] runtime cleanup failed', err);
  }
}

export function createRuntimeLifecycle(): RuntimeLifecycle {
  let activeRouteKey: string | null = null;
  const cleanups: CleanupFn[] = [];

  return {
    activate(routeKey: string): void {
      activeRouteKey = routeKey;
    },
    routeKey(): string | null {
      return activeRouteKey;
    },
    isActive(): boolean {
      return activeRouteKey !== null;
    },
    registerCleanup(cleanup: CleanupFn): void {
      cleanups.push(cleanup);
    },
    dispose(): void {
      while (cleanups.length > 0) {
        const cleanup = cleanups.pop();
        if (!cleanup) continue;
        safeRun(cleanup);
      }

      activeRouteKey = null;
    },
  };
}
