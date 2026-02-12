import { describe, expect, it } from 'bun:test';
import { createRuntimeController } from './runtime-controller';

describe('runtime controller', () => {
  it('is enabled for processing before enterEnabled callbacks run', async () => {
    let enabled = true;
    let enabledDuringEnter = false;
    let controllerRef: ReturnType<typeof createRuntimeController> | null = null;

    const controller = createRuntimeController({
      getRouteKey: () => '/feed/',
      isRouteEligible: (route) => route.startsWith('/feed/'),
      readEnabled: async () => enabled,
      enterDisabled: () => undefined,
      enterEnabled: () => {
        enabledDuringEnter = controllerRef?.isEnabledForProcessing() ?? false;
      },
      isAttachmentLive: () => true,
    });

    controllerRef = controller;
    await controller.reconcile('init');

    expect(enabledDuringEnter).toBe(true);
    expect(controller.getState().mode).toBe('enabled_active');
  });

  it('transitions disabled -> enabled and re-enters on watchdog', async () => {
    let enabled = false;
    let routeKey = '/feed/';
    const calls: string[] = [];

    const controller = createRuntimeController({
      getRouteKey: () => routeKey,
      isRouteEligible: (route) => route.startsWith('/feed/'),
      readEnabled: async () => enabled,
      enterDisabled: () => {
        calls.push('disabled');
      },
      enterEnabled: ({ forceAttach }) => {
        calls.push(forceAttach ? 'enabled-force' : 'enabled');
      },
      isAttachmentLive: () => true,
    });

    await controller.reconcile('init');
    expect(controller.getState().mode).toBe('disabled');

    enabled = true;
    await controller.reconcile('toggle');
    expect(controller.getState().mode).toBe('enabled_active');

    await controller.reconcile('watchdog');
    expect(calls).toEqual(['disabled', 'enabled', 'enabled-force']);
  });

  it('enters disabled when route is not eligible', async () => {
    let enabled = true;
    let routeKey = '/feed/';
    let disabledCalls = 0;

    const controller = createRuntimeController({
      getRouteKey: () => routeKey,
      isRouteEligible: (route) => route.startsWith('/feed/'),
      readEnabled: async () => enabled,
      enterDisabled: () => {
        disabledCalls += 1;
      },
      enterEnabled: () => undefined,
      isAttachmentLive: () => false,
    });

    await controller.reconcile('init');
    routeKey = '/notifications/';
    await controller.reconcile('route');

    expect(disabledCalls).toBe(1);
    expect(controller.getState().mode).toBe('disabled');
    expect(controller.isEnabledForProcessing()).toBe(false);
  });
});
