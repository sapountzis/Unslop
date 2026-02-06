import { ATTRIBUTES } from '../lib/selectors';

function setGate(enabled: boolean): void {
  if (enabled) {
    document.documentElement.setAttribute(ATTRIBUTES.preclassify, 'true');
    return;
  }
  document.documentElement.removeAttribute(ATTRIBUTES.preclassify);
}

export function enableGateImmediately(): void {
  setGate(true);
}

export function syncGateWithEnabledState(isEnabled: boolean): void {
  setGate(isEnabled);
}

export function disableGate(): void {
  setGate(false);
}
