import { describe, expect, it } from 'bun:test';
import { SELECTORS } from '../lib/selectors';

describe('preclassify selector coverage', () => {
  it('targets only outer feed card roots', async () => {
    expect(SELECTORS.candidatePostRoot.includes('.feed-shared-update-v2[role="article"]')).toBe(true);
    expect(SELECTORS.candidatePostRoot.includes('[data-urn^="urn:li:activity:"]')).toBe(true);
    expect(SELECTORS.candidatePostRoot.includes('[data-urn^="urn:li:share:"]')).toBe(true);

    const css = await Bun.file('./src/styles/content.css').text();
    expect(css.includes('.feed-shared-update-v2[role="article"][data-urn^="urn:li:activity:"]:not([data-unslop-processed])')).toBe(true);
    expect(css.includes('.feed-shared-update-v2[role="article"][data-urn^="urn:li:share:"]:not([data-unslop-processed])')).toBe(true);
    expect(/html\[data-unslop-preclassify="true"\]\s+\.feed-shared-update-v2:not\(\[data-unslop-processed\]\)/.test(css)).toBe(false);
    expect(css.includes('display: none')).toBe(true);
  });
});
