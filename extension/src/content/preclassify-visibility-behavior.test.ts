import { describe, expect, it } from 'bun:test';
import { ATTRIBUTES } from '../lib/selectors';

function preclassifyRuleBlock(css: string): string {
  const match = css.match(
    /html\[data-unslop-preclassify="true"\][\s\S]*?\[data-finite-scroll-hotkey-item\]:has\(\.feed-shared-update-v2\[role="article"\]\):not\(\[data-unslop-processed\]\)\s*\{[\s\S]*?\}/
  );
  return match?.[0] ?? '';
}

describe('preclassify hide mechanics', () => {
  it('uses opacity-based prehide instead of display none', async () => {
    const css = await Bun.file('./src/styles/content.css').text();
    const rule = preclassifyRuleBlock(css);

    expect(rule.length > 0).toBe(true);
    expect(rule.includes('visibility: hidden')).toBe(false);
    expect(rule.includes('opacity: 0')).toBe(true);
    expect(rule.includes('pointer-events: none')).toBe(true);
    expect(rule.includes('display: none')).toBe(false);
  });

  it('uses the preclassify html attribute gate selector', async () => {
    const css = await Bun.file('./src/styles/content.css').text();
    expect(css.includes(`html[${ATTRIBUTES.preclassify}="true"]`)).toBe(true);
  });
});
