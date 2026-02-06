import { ATTRIBUTES, SELECTORS } from '../lib/selectors';

function removeScopedChild(element: HTMLElement, selector: string): void {
  if (typeof (element as { querySelector?: unknown }).querySelector !== 'function') {
    return;
  }
  const child = element.querySelector(selector);
  if (child && typeof (child as { remove?: unknown }).remove === 'function') {
    (child as { remove: () => void }).remove();
  }
}

export function resetPostElementState(element: HTMLElement): void {
  element.removeAttribute(ATTRIBUTES.processing);
  element.removeAttribute(ATTRIBUTES.processed);
  element.removeAttribute(ATTRIBUTES.decision);
  element.classList.remove('unslop-hidden-post');
  element.classList.remove('unslop-hidden-post-stub');
  removeScopedChild(element, ':scope > .unslop-hidden-stub');
  removeScopedChild(element, ':scope > .unslop-dim-header');
  element.style.opacity = '1';
}

export function clearUnslopStateInDocument(): void {
  const candidates = document.querySelectorAll(SELECTORS.candidatePostRoot);
  for (const candidate of candidates) {
    if (candidate instanceof HTMLElement) {
      resetPostElementState(candidate);
    }
  }
}
