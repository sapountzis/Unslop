import { describe, expect, it } from "bun:test";
import type { PlatformPlugin } from "./platform";
import { linkedinPlugin } from "./linkedin/plugin";
import { xPlugin } from "./x/plugin";
import { redditPlugin } from "./reddit/plugin";

function assertPluginContract(plugin: PlatformPlugin): void {
	expect(plugin.id).toBeTruthy();
	expect(plugin.selectors).toBeTruthy();
	expect(plugin.selectors.feed).toBeTruthy();
	expect(plugin.selectors.candidatePostRoot).toBeTruthy();
	expect(plugin.selectors.renderPostRoot).toBeTruthy();
	expect(plugin.preclassifyCssSelector).toBeTruthy();
	expect(typeof plugin.shouldFilterRoute).toBe("function");
	expect(typeof plugin.routeKeyFromUrl).toBe("function");
	expect(typeof plugin.shouldFilterRouteKey).toBe("function");
	expect(typeof plugin.findFeedRoot).toBe("function");
	expect(typeof plugin.resolvePostSurface).toBe("function");
	expect(typeof plugin.extractPostData).toBe("function");
	expect(typeof plugin.readPostIdentity).toBe("function");
}

describe("platform plugin contract compliance", () => {
	it("linkedin plugin satisfies PlatformPlugin", () => {
		assertPluginContract(linkedinPlugin);
		expect(linkedinPlugin.id).toBe("linkedin");
	});

	it("x plugin satisfies PlatformPlugin", () => {
		assertPluginContract(xPlugin);
		expect(xPlugin.id).toBe("x");
	});

	it("reddit plugin satisfies PlatformPlugin", () => {
		assertPluginContract(redditPlugin);
		expect(redditPlugin.id).toBe("reddit");
	});

	it("each plugin has a unique id", () => {
		const ids = [linkedinPlugin.id, xPlugin.id, redditPlugin.id];
		expect(new Set(ids).size).toBe(3);
	});
});
