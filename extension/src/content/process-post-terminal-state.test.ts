import { describe, expect, it } from 'bun:test';
import { renderDecision } from './decision-renderer';
import { ATTRIBUTES } from '../lib/selectors';

class MockPostElement {
  public style = { opacity: '' };
  public classList = {
    remove: (_name: string) => undefined,
    add: (_name: string) => undefined,
  };

  private attributes = new Map<string, string>();

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  removeAttribute(name: string): void {
    this.attributes.delete(name);
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  querySelector(_selector: string): null {
    return null;
  }
}

type MockHTMLElement = MockPostElement & HTMLElement;

describe('processPost terminal state', () => {
  it('keep decision clears processing and marks processed', () => {
    const post = new MockPostElement() as MockHTMLElement;

    post.setAttribute(ATTRIBUTES.processing, 'true');
    renderDecision(post, 'keep');

    expect(post.getAttribute(ATTRIBUTES.processing)).toBeNull();
    expect(post.getAttribute(ATTRIBUTES.processed)).toBe('true');
  });
});
