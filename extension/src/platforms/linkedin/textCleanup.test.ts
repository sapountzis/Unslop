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

	it("strips job-update labels and automated reaction suggestion tails", () => {
		const cleaned = cleanupLinkedInText(
			"eleni pappa\u2019s job update eleni completed 4 years at noris mike 7 3 comments like comment congratulations! excited for you well deserved, eleni wishing you the best",
		);
		expect(cleaned).toBe("eleni completed 4 years at noris mike");
	});

	it("strips duplicated actor header, following/verified tags, and visibility metadata", () => {
		const cleaned = cleanupLinkedInText(
			"simon heatonsimon heaton • followingverified • following director of growth marketing @ buffer director of growth marketing @ buffer 1w • 1 week ago • visible to anyone on or off linkedin we're hiring a senior data scientist at buffer! ...more 144 19 comments 11 reposts",
		);
		expect(cleaned).toBe("we're hiring a senior data scientist at buffer!");
	});

	it("strips duplicated follower/time metadata and loading UI noise", () => {
		const cleaned = cleanupLinkedInText(
			"softetasofteta 9,425 followers9,425 followers 7m • 7 minutes ago • visible to anyone on or off linkedin we stand out because we put you first. ...more your document is loading",
		);
		expect(cleaned).toBe("we stand out because we put you first.");
	});

	it("strips promoted headers and download/view-form control tails", () => {
		const cleaned = cleanupLinkedInText(
			"kalimera.aikalimera.ai 497 followers497 followers promotedpromoted reduce your airline operating costs by up to 60%! ...more download free whitepaper kalimera.ai download. view form download 6 1",
		);
		expect(cleaned).toBe("reduce your airline operating costs by up to 60%!");
	});

	it("strips load-more-comments action rows", () => {
		const cleaned = cleanupLinkedInText(
			"my post body like reply load more comments",
		);
		expect(cleaned).toBe("my post body");
	});

	it("strips following/verified metadata that precedes content", () => {
		const cleaned = cleanupLinkedInText(
			"followingverified • following real post body",
		);
		expect(cleaned).toBe("real post body");
	});

	it("strips connection-follow prefix metadata before post body", () => {
		const cleaned = cleanupLinkedInText(
			"George Spanidis, Nektaria Toto and 51 other connections follow LinkedIn for Marketing this is the real post body",
		);
		expect(cleaned).toBe("this is the real post body");
	});

	it("strips single-actor follows prefix metadata before post body", () => {
		const cleaned = cleanupLinkedInText(
			"Nektaria Toto follows LinkedIn for Marketing this is the real post body",
		);
		expect(cleaned).toBe("this is the real post body");
	});

	it("strips leaked follow action prefix before post body", () => {
		const cleaned = cleanupLinkedInText(
			"follow lazy engineers are good engineers",
		);
		expect(cleaned).toBe("lazy engineers are good engineers");
	});

	it("strips leaked follow action prefix in long-form content", () => {
		const cleaned = cleanupLinkedInText(
			"follow coding isn't dying. bad developers are.the head of claude",
		);
		expect(cleaned).toBe(
			"coding isn't dying. bad developers are.the head of claude",
		);
	});

	it("preserves natural follow-up prose at sentence start", () => {
		const cleaned = cleanupLinkedInText(
			"follow up with the release team tomorrow morning please",
		);
		expect(cleaned).toBe(
			"follow up with the release team tomorrow morning please",
		);
	});

	it("normalizes pipe separators used in metadata prefixes", () => {
		const cleaned = cleanupLinkedInText(
			"followingverified | following | real post body",
		);
		expect(cleaned).toBe("real post body");
	});

	it("preserves normal prose with congratulations language", () => {
		const cleaned = cleanupLinkedInText(
			"We said congratulations to the team and wishing you the best in public.",
		);
		expect(cleaned).toBe(
			"we said congratulations to the team and wishing you the best in public.",
		);
	});

	it("falls back to normalized text when stripping would leave only a tiny fragment", () => {
		const rawText =
			"status ok like comment congratulations! excited for you well deserved wishing you the best";
		const cleaned = cleanupLinkedInText(rawText);
		expect(cleaned).toBe(rawText);
	});

	it("preserves follow wording inside normal prose", () => {
		const cleaned = cleanupLinkedInText(
			"We follow market updates and follow up with customers every week.",
		);
		expect(cleaned).toBe(
			"we follow market updates and follow up with customers every week.",
		);
	});
});
