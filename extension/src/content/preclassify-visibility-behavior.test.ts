import { describe, expect, it } from 'bun:test';
import { ATTRIBUTES } from '../lib/selectors';

describe('preclassify hide mechanics', () => {
  it('does not use visibility hidden', async () => {
    const css = await Bun.file('./src/styles/content.css').text();
    expect(css.includes('visibility: hidden')).toBe(false);
    expect(css.includes('display: none')).toBe(true);
  });

  it('uses the preclassify html attribute gate selector', async () => {
    const css = await Bun.file('./src/styles/content.css').text();
    expect(css.includes(`html[${ATTRIBUTES.preclassify}="true"]`)).toBe(true);
  });
});
