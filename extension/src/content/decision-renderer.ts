import { Decision } from '../types';
import { ATTRIBUTES } from '../lib/selectors';
import { HIDE_RENDER_MODE, HideRenderMode } from '../lib/config';
import { resetPostElementState } from './marker-manager';

function createHiddenLabel(): HTMLElement {
  const label = document.createElement('span');
  label.className = 'unslop-hidden-label';
  label.textContent = 'Unslop: hide';
  return label;
}

export function renderDecision(
  element: HTMLElement,
  decision: Decision,
  _postId?: string,
  options?: { hideMode?: HideRenderMode }
): void {
  const hideMode = options?.hideMode ?? HIDE_RENDER_MODE;

  resetPostElementState(element);
  element.setAttribute(ATTRIBUTES.processed, 'true');

  switch (decision) {
    case 'keep':
      break;

    case 'hide':
      element.setAttribute(ATTRIBUTES.decision, 'hide');
      if (hideMode === 'label') {
        if (!element.querySelector(':scope > .unslop-hidden-label')) {
          element.prepend(createHiddenLabel());
        }
      } else {
        element.classList.add('unslop-hidden-post');
      }
      break;
  }
}
