import { describe, expect, it } from "bun:test";
import { SELECTORS } from "./selectors";

describe("reddit selectors", () => {
	it("defines required platform selectors", () => {
		expect(SELECTORS.feed).toBeTruthy();
		expect(SELECTORS.candidatePostRoot).toBeTruthy();
		expect(SELECTORS.renderPostRoot).toBeTruthy();
		expect(SELECTORS.candidatePostRoot.includes("shreddit-ad-post")).toBe(true);
	});

	it("has post content selectors", () => {
		expect(SELECTORS.postTitle).toBeTruthy();
		expect(SELECTORS.postBody).toBeTruthy();
		expect(SELECTORS.authorName).toBeTruthy();
		expect(SELECTORS.permalinkLink).toBeTruthy();
	});
});
