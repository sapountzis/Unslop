import { describe, expect, it } from "bun:test";
import { SELECTORS } from "./selectors";

describe("x selectors", () => {
	it("defines required platform selectors", () => {
		expect(SELECTORS.feed).toBeTruthy();
		expect(SELECTORS.candidatePostRoot).toBeTruthy();
		expect(SELECTORS.renderPostRoot).toBeTruthy();
	});

	it("has tweet content selectors", () => {
		expect(SELECTORS.tweetText).toBeTruthy();
		expect(SELECTORS.authorHandle).toBeTruthy();
		expect(SELECTORS.authorDisplayName).toBeTruthy();
	});
});
