import { Decision } from '../types';
import { ATTRIBUTES } from '../lib/selectors';
import { HIDE_RENDER_MODE, HideRenderMode } from '../lib/config';
import { resetPostElementState } from './marker-manager';

function createDecisionLabel(decision: Decision): HTMLElement {
  const label = document.createElement('span');
  label.className = `unslop-decision-label unslop-decision-label--${decision}`;
  label.textContent = `Unslop: ${decision}`;
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

  if (hideMode === 'label') {
    element.classList.add('unslop-decision-host');
    const existingLabel = element.querySelector(':scope > .unslop-decision-label');
    if (!existingLabel) {
      element.append(createDecisionLabel(decision));
    }
  }

  switch (decision) {
    case 'keep':
      break;

    case 'hide':
      element.setAttribute(ATTRIBUTES.decision, 'hide');
      if (hideMode !== 'label') {
        element.classList.add('unslop-hidden-post');
      }
      break;
  }
}
