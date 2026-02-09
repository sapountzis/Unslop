export type RuntimeMode = 'disabled' | 'enabled_attaching' | 'enabled_active';

type ReconcileReason = 'init' | 'route' | 'toggle' | 'visibility' | 'watchdog';

type RuntimeControllerOptions = {
  getRouteKey: () => string;
  isRouteEligible: (routeKey: string) => boolean;
  readEnabled: () => Promise<boolean>;
  enterDisabled: (routeKey: string) => void;
  enterEnabled: (input: { routeKey: string; forceAttach: boolean }) => void;
  isAttachmentLive: (routeKey: string) => boolean;
};

export type RuntimeControllerState = {
  mode: RuntimeMode;
  routeKey: string;
  enabled: boolean;
};

export function createRuntimeController(options: RuntimeControllerOptions) {
  let state: RuntimeControllerState = {
    mode: 'disabled',
    routeKey: '',
    enabled: true,
  };

  async function reconcile(reason: ReconcileReason): Promise<void> {
    const routeKey = options.getRouteKey();
    const enabled = await options.readEnabled();
    const shouldRun = enabled && options.isRouteEligible(routeKey);
    const forceAttach = reason === 'watchdog';

    if (!shouldRun) {
      const shouldTransition =
        state.mode !== 'disabled' ||
        state.routeKey !== routeKey ||
        state.enabled !== enabled;

      if (shouldTransition) {
        options.enterDisabled(routeKey);
      }

      state = {
        mode: 'disabled',
        routeKey,
        enabled,
      };
      return;
    }

    const mustReenter =
      state.mode === 'disabled' ||
      state.routeKey !== routeKey ||
      state.enabled !== enabled ||
      forceAttach;

    if (mustReenter) {
      // Transition to an enabled mode before callbacks run so downstream
      // runtime hooks can process the current route immediately.
      state = {
        mode: 'enabled_attaching',
        routeKey,
        enabled,
      };
      options.enterEnabled({ routeKey, forceAttach });
    }

    state = {
      mode: options.isAttachmentLive(routeKey) ? 'enabled_active' : 'enabled_attaching',
      routeKey,
      enabled,
    };
  }

  return {
    reconcile,
    getState(): RuntimeControllerState {
      return { ...state };
    },
    isEnabledForProcessing(): boolean {
      return state.mode !== 'disabled';
    },
  };
}
