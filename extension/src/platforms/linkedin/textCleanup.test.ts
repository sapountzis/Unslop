import { describe, expect, it } from "bun:test";
import { cleanupLinkedInText } from "./textCleanup";

describe("linkedin text cleanup", () => {
	it("strips feed numbering and engagement prefixes", () => {
		const cleaned = cleanupLinkedInText(
			"Feed post number 15 Coursera commented on this It's kind of wild.",
		);
		expect(cleaned).toBe("it's kind of wild.");
	});

	it("strips trailing social counts and action bar labels", () => {
		const cleaned = cleanupLinkedInText(
			"My post body 33 reactions 13 comments like comment repost send",
		);
		expect(cleaned).toBe("my post body");
	});

	it("preserves normal prose that includes like/comment words", () => {
		const cleaned = cleanupLinkedInText(
			"I like this approach and you can comment if you disagree.",
		);
		expect(cleaned).toBe(
			"i like this approach and you can comment if you disagree.",
		);
	});
});
