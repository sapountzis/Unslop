import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { renderDecision } from './decision-renderer';
import { ATTRIBUTES } from '../lib/selectors';

class MockClassList {
  private tokens = new Set<string>();

  add(token: string): void {
    this.tokens.add(token);
  }

  remove(token: string): void {
    this.tokens.delete(token);
  }

  contains(token: string): boolean {
    return this.tokens.has(token);
  }
}

class MockElement {
  parentElement: MockElement | null = null;
  children: MockElement[] = [];
  style: Record<string, string> = {};
  className = '';
  classList = new MockClassList();
  innerHTML = '';

  private attributes = new Map<string, string>();

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  hasAttribute(name: string): boolean {
    return this.attributes.has(name);
  }

  removeAttribute(name: string): void {
    this.attributes.delete(name);
  }

  prepend(child: MockElement): void {
    child.parentElement = this;
    this.children.unshift(child);
  }

  append(...children: MockElement[]): void {
    for (const child of children) {
      child.parentElement = this;
      this.children.push(child);
    }
  }

  querySelector(selector: string): MockElement | null {
    if (selector === ':scope > .unslop-dim-header') {
      return this.children.find((child) => child.className === 'unslop-dim-header') ?? null;
    }
    if (selector === ':scope > .unslop-hidden-stub' || selector === '.unslop-hidden-stub') {
      return this.children.find((child) => child.className === 'unslop-hidden-stub') ?? null;
    }
    if (selector === '.unslop-hidden-stub-action') {
      const stub = this.children.find((child) => child.className === 'unslop-hidden-stub');
      return stub?.children.find((child) => child.className === 'unslop-hidden-stub-action') ?? null;
    }
    return null;
  }

  addEventListener(): void {
    // no-op for tests in this suite
  }

  remove(): void {
    if (!this.parentElement) return;
    this.parentElement.children = this.parentElement.children.filter((child) => child !== this);
    this.parentElement = null;
  }
}

const originalDocument = globalThis.document;

describe('renderDecision', () => {
  beforeEach(() => {
    (globalThis as any).document = {
      createElement: (tagName?: string) => {
        const element = new MockElement();
        if (tagName === 'button') {
          element.className = 'unslop-hidden-stub-action';
        }
        return element;
      },
    };
  });

  afterEach(() => {
    if (typeof originalDocument === 'undefined') {
      delete (globalThis as any).document;
      return;
    }
    (globalThis as any).document = originalDocument;
  });

  it('marks keep decisions as processed only', () => {
    const post = new MockElement();
    renderDecision(post as unknown as HTMLElement, 'keep');

    expect(post.hasAttribute(ATTRIBUTES.processed)).toBe(true);
    expect(post.getAttribute(ATTRIBUTES.decision)).toBeNull();
    expect(post.children.length).toBe(0);
  });

  it('applies dim style and prepends header once', () => {
    const post = new MockElement();
    renderDecision(post as unknown as HTMLElement, 'dim', 'post-1');
    renderDecision(post as unknown as HTMLElement, 'dim', 'post-1');

    expect(post.hasAttribute(ATTRIBUTES.processed)).toBe(true);
    expect(post.getAttribute(ATTRIBUTES.decision)).toBe('dim');
    expect(post.style.opacity).toBe('0.35');
    expect(post.children.length).toBe(1);
    expect(post.children[0].className).toBe('unslop-dim-header');
  });

  it('keeps post node mounted and does not inject a visible replacement stub', () => {
    const feed = new MockElement();
    const post = new MockElement();
    feed.prepend(post);

    renderDecision(post as unknown as HTMLElement, 'hide');

    expect(feed.children.includes(post)).toBe(true);
    expect(post.hasAttribute(ATTRIBUTES.processed)).toBe(true);
    expect(post.getAttribute(ATTRIBUTES.decision)).toBe('hide');
    expect(post.classList.contains('unslop-hidden-post')).toBe(true);
    expect(post.querySelector(':scope > .unslop-hidden-stub')).toBeNull();
  });

  it('supports stub mode for hide decision in local testing', () => {
    const post = new MockElement();

    renderDecision(post as unknown as HTMLElement, 'hide', 'post-2', { hideMode: 'stub' });

    expect(post.classList.contains('unslop-hidden-post')).toBe(false);
    expect(post.classList.contains('unslop-hidden-post-stub')).toBe(true);
    expect(post.querySelector(':scope > .unslop-hidden-stub')).not.toBeNull();
  });
});
