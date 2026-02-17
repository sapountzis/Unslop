import { describe, expect, it } from "bun:test";
import { linkedinPlugin } from "../platforms/linkedin/plugin";
import { SELECTORS } from "../platforms/linkedin/selectors";

function preclassifyRuleBlock(css: string): string {
	const match = css.match(
		/html\[data-unslop-preclassify="true"\][\s\S]*?\[data-finite-scroll-hotkey-item\]\s*:has\(\s*\.feed-shared-update-v2\[role="article"\]\s*\)\s*:not\(\[data-unslop-processed\]\)[^{]*\{[\s\S]*?\}/,
	);
	return match?.[0] ?? "";
}

describe("preclassify selector coverage", () => {
	it("linkedin plugin preclassify selector targets outer feed card roots", () => {
		expect(
			linkedinPlugin.preclassifyCssSelector.includes(
				"[data-finite-scroll-hotkey-item]",
			),
		).toBe(true);
		expect(
			linkedinPlugin.preclassifyCssSelector.includes(
				':has(.feed-shared-update-v2[role="article"])',
			),
		).toBe(true);
		expect(
			linkedinPlugin.preclassifyCssSelector.includes(
				":not([data-unslop-processed])",
			),
		).toBe(true);
	});

	it("linkedin CSS file contains the preclassify hiding rules", async () => {
		const css = await Bun.file("./src/styles/content.css").text();
		const rule = preclassifyRuleBlock(css);

		expect(rule.length > 0).toBe(true);
		expect(
			/\[data-finite-scroll-hotkey-item\]\s*:has\(\s*\.feed-shared-update-v2\[role="article"\]\s*\)\s*:not\(\[data-unslop-processed\]\)/.test(
				css,
			),
		).toBe(true);
		expect(/:not\(\[data-id\^="urn:li:aggregate:"\]\)/.test(css)).toBe(true);
		expect(
			/:not\(\s*:has\(\.feed-shared-aggregated-content\)\s*\)/.test(css),
		).toBe(true);
		expect(
			/:not\(\s*:has\(\.update-components-feed-discovery-entity\)\s*\)/.test(
				css,
			),
		).toBe(true);
		expect(rule.includes("opacity: 0")).toBe(true);
		expect(rule.includes("pointer-events: none")).toBe(true);
	});

	it("includes linkedin selector constants for repost/image/document parsing inputs", () => {
		expect(SELECTORS.nestedRepostLinkContainer).toContain(
			"update-components-mini-update-v2__link-to-details-page",
		);
		expect(SELECTORS.imageNodes).toContain("update-components-image__image");
		expect(SELECTORS.documentContainer).toContain(
			"update-components-document__container",
		);
		expect(SELECTORS.documentIframe).toContain(
			"document-s-container__document-element",
		);
		expect(SELECTORS.documentSourceHints).toContain("feedshare-document");
	});
});
