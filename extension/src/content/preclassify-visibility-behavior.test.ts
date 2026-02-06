import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { disableGate, enableGateImmediately, syncGateWithEnabledState } from './preclassify-gate';
import { ATTRIBUTES } from '../lib/selectors';

const originalDocument = globalThis.document;

function createMockDocument() {
  const attrs = new Map<string, string>();
  return {
    documentElement: {
      setAttribute: (key: string, value: string) => {
        attrs.set(key, value);
      },
      removeAttribute: (key: string) => {
        attrs.delete(key);
      },
      getAttribute: (key: string) => attrs.get(key) ?? null,
      hasAttribute: (key: string) => attrs.has(key),
    },
  } as unknown as Document;
}

describe('preclassify hide mechanics', () => {
  beforeEach(() => {
    (globalThis as { document: Document }).document = createMockDocument();
  });

  afterEach(() => {
    if (typeof originalDocument === 'undefined') {
      delete (globalThis as { document?: Document }).document;
      return;
    }
    (globalThis as { document: Document }).document = originalDocument;
  });

  it('does not use visibility hidden', async () => {
    const css = await Bun.file('./src/styles/content.css').text();
    expect(css.includes('visibility: hidden')).toBe(false);
    expect(css.includes('display: none')).toBe(true);
  });

  it('applies preclassify gate immediately and reconciles after enabled state resolves', () => {
    enableGateImmediately();
    expect(document.documentElement.hasAttribute(ATTRIBUTES.preclassify)).toBe(true);

    syncGateWithEnabledState(false);
    expect(document.documentElement.hasAttribute(ATTRIBUTES.preclassify)).toBe(false);

    syncGateWithEnabledState(true);
    expect(document.documentElement.getAttribute(ATTRIBUTES.preclassify)).toBe('true');

    disableGate();
    expect(document.documentElement.hasAttribute(ATTRIBUTES.preclassify)).toBe(false);
  });
});
