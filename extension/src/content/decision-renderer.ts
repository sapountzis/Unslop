import { Decision } from '../types';
import { decisionCache } from '../lib/storage';
import { ATTRIBUTES } from '../lib/selectors';
import { HIDE_RENDER_MODE, HideRenderMode } from '../lib/config';
import { removeScopedChild } from './dom-utils';

function createDimHeader(element: HTMLElement, postId?: string): HTMLElement {
  const header = document.createElement('div');
  header.className = 'unslop-dim-header';
  header.innerHTML = `
    <span class="unslop-dim-header-text">Unslop: Low quality post</span>
    <span class="unslop-dim-header-action">Restore</span>
  `;

  header.addEventListener('click', async (e) => {
    e.stopPropagation();
    element.style.opacity = '1';
    header.remove();

    if (postId) {
      await decisionCache.set(postId, 'keep', 'cache');
    }
  });

  return header;
}

function createHiddenStub(element: HTMLElement, postId?: string): HTMLElement {
  const stub = document.createElement('div');
  stub.className = 'unslop-hidden-stub';
  const text = document.createElement('span');
  text.className = 'unslop-hidden-stub-text';
  text.textContent = 'Unslop hid a post';

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'unslop-hidden-stub-action';
  button.textContent = 'Unhide';

  stub.append(text, button);

  button.addEventListener('click', async (e) => {
    e.stopPropagation();
    element.classList.remove('unslop-hidden-post-stub');
    element.removeAttribute(ATTRIBUTES.decision);
    stub.remove();

    if (postId) {
      await decisionCache.set(postId, 'keep', 'cache');
    }
  });

  return stub;
}

export function renderDecision(
  element: HTMLElement,
  decision: Decision,
  postId?: string,
  options?: { hideMode?: HideRenderMode }
): void {
  const hideMode = options?.hideMode ?? HIDE_RENDER_MODE;

  element.removeAttribute(ATTRIBUTES.processing);
  element.setAttribute(ATTRIBUTES.processed, 'true');

  // Always clear transitional styles before applying the final decision.
  element.classList.remove('unslop-hidden-post');
  element.classList.remove('unslop-hidden-post-stub');
  removeScopedChild(element, ':scope > .unslop-hidden-stub');
  removeScopedChild(element, ':scope > .unslop-dim-header');
  element.style.opacity = '1';
  if (decision !== 'dim') {
    element.removeAttribute(ATTRIBUTES.decision);
  }

  switch (decision) {
    case 'keep':
      break;

    case 'dim':
      element.style.opacity = '0.35';
      element.setAttribute(ATTRIBUTES.decision, 'dim');
      if (!element.querySelector(':scope > .unslop-dim-header')) {
        element.prepend(createDimHeader(element, postId));
      }
      break;

    case 'hide':
      element.setAttribute(ATTRIBUTES.decision, 'hide');
      if (hideMode === 'stub') {
        element.classList.add('unslop-hidden-post-stub');
        element.prepend(createHiddenStub(element, postId));
      } else {
        element.classList.add('unslop-hidden-post');
      }
      break;
  }
}
