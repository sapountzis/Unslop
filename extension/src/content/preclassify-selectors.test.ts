import { describe, expect, it } from 'bun:test';
import { SELECTORS } from '../lib/selectors';

function preclassifyRuleBlock(css: string): string {
  const match = css.match(
    /html\[data-unslop-preclassify="true"\][\s\S]*?\[data-finite-scroll-hotkey-item\]:has\(\.feed-shared-update-v2\[role="article"\]\):not\(\[data-unslop-processed\]\)\s*\{[\s\S]*?\}/
  );
  return match?.[0] ?? '';
}

describe('preclassify selector coverage', () => {
  it('targets only outer feed card roots', async () => {
    expect(SELECTORS.renderPostRoot.includes('[data-finite-scroll-hotkey-item]')).toBe(true);
    expect(SELECTORS.renderPostRoot.includes(':has(.feed-shared-update-v2[role="article"])')).toBe(true);

    const css = await Bun.file('./src/styles/content.css').text();
    const rule = preclassifyRuleBlock(css);

    expect(rule.length > 0).toBe(true);
    expect(css.includes('[data-finite-scroll-hotkey-item]:has(.feed-shared-update-v2[role="article"]):not([data-unslop-processed])')).toBe(true);
    expect(/html\[data-unslop-preclassify="true"\]\s+\.feed-shared-update-v2:not\(\[data-unslop-processed\]\)/.test(css)).toBe(false);
    expect(rule.includes('opacity: 0')).toBe(true);
    expect(rule.includes('pointer-events: none')).toBe(true);
  });
});
