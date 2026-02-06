import { ATTRIBUTES, SELECTORS } from '../lib/selectors';
import { removeScopedChild } from './dom-utils';

export function clearUnslopElementState(element: HTMLElement): void {
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
      clearUnslopElementState(candidate);
    }
  }
}
