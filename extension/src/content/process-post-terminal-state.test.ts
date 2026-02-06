import { describe, expect, it } from 'bun:test';
import { renderDecision } from './decision-renderer';
import { ATTRIBUTES } from '../lib/selectors';

describe('processPost terminal state', () => {
  it('keep decision clears processing and marks processed', () => {
    const post = {
      style: { opacity: '' },
      classList: {
        remove: () => undefined,
        add: () => undefined,
      },
      setAttribute: function (name: string, value: string) {
        (this as any)[name] = value;
      },
      removeAttribute: function (name: string) {
        delete (this as any)[name];
      },
    } as unknown as HTMLElement;

    (post as any).setAttribute(ATTRIBUTES.processing, 'true');
    renderDecision(post, 'keep');

    expect((post as any)[ATTRIBUTES.processing]).toBeUndefined();
    expect((post as any)[ATTRIBUTES.processed]).toBe('true');
  });
});
