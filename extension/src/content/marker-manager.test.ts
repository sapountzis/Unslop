import { describe, expect, it } from 'bun:test';
import { ATTRIBUTES } from '../lib/selectors';
import { resetPostElementState } from './marker-manager';

describe('marker manager', () => {
  it('clears unslop markers and UI artifacts from an element', () => {
    const attrs = new Set<string>([
      ATTRIBUTES.processing,
      ATTRIBUTES.processed,
      ATTRIBUTES.decision,
      ATTRIBUTES.identity,
    ]);
    const classes = new Set<string>(['unslop-hidden-post', 'unslop-decision-host']);
    const style: { opacity?: string } = { opacity: '0.35' };

    const decisionLabel = { removed: false, remove() { this.removed = true; } };
    const hiddenLabel = { removed: false, remove() { this.removed = true; } };

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
        if (selector === ':scope > .unslop-decision-label') return decisionLabel;
        if (selector === ':scope > .unslop-hidden-label') return hiddenLabel;
        return null;
      },
      style,
    } as {
      removeAttribute: (name: string) => void;
      classList: { remove: (name: string) => void };
      querySelector: (selector: string) => { remove: () => void } | null;
      style: { opacity?: string };
    } & HTMLElement;

    resetPostElementState(element);

    expect(attrs.has(ATTRIBUTES.processing)).toBe(false);
    expect(attrs.has(ATTRIBUTES.processed)).toBe(false);
    expect(attrs.has(ATTRIBUTES.decision)).toBe(false);
    expect(attrs.has(ATTRIBUTES.identity)).toBe(false);
    expect(classes.has('unslop-hidden-post')).toBe(false);
    expect(classes.has('unslop-decision-host')).toBe(false);
    expect(decisionLabel.removed).toBe(true);
    expect(hiddenLabel.removed).toBe(true);
    expect(style.opacity).toBe('1');
  });
});
