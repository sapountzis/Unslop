import { describe, expect, it } from 'bun:test';
import { ATTRIBUTES } from '../lib/selectors';
import { clearUnslopElementState } from './marker-manager';

describe('marker manager', () => {
  it('clears unslop markers and UI artifacts from an element', () => {
    const attrs = new Set<string>([
      ATTRIBUTES.processing,
      ATTRIBUTES.processed,
      ATTRIBUTES.decision,
    ]);
    const classes = new Set<string>(['unslop-hidden-post', 'unslop-hidden-post-stub']);
    const style: { opacity?: string } = { opacity: '0.35' };

    const hiddenStub = { removed: false, remove() { this.removed = true; } };
    const dimHeader = { removed: false, remove() { this.removed = true; } };

    const element = {
      removeAttribute: (name: string) => {
        attrs.delete(name);
      },
      classList: {
        remove: (name: string) => {
          classes.delete(name);
        },
      },
      querySelector: (selector: string) => {
        if (selector === ':scope > .unslop-hidden-stub') return hiddenStub;
        if (selector === ':scope > .unslop-dim-header') return dimHeader;
        return null;
      },
      style,
    } as unknown as HTMLElement;

    clearUnslopElementState(element);

    expect(attrs.has(ATTRIBUTES.processing)).toBe(false);
    expect(attrs.has(ATTRIBUTES.processed)).toBe(false);
    expect(attrs.has(ATTRIBUTES.decision)).toBe(false);
    expect(classes.has('unslop-hidden-post')).toBe(false);
    expect(classes.has('unslop-hidden-post-stub')).toBe(false);
    expect(hiddenStub.removed).toBe(true);
    expect(dimHeader.removed).toBe(true);
    expect(style.opacity).toBe('1');
  });
});
