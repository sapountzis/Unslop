import { describe, expect, it } from "bun:test";
import { cleanupLinkedInText } from "./textCleanup";

function clean(rawText: string): string {
	return cleanupLinkedInText(rawText).text;
}

describe("linkedin text cleanup", () => {
	it("strips feed numbering and engagement prefixes", () => {
		const cleaned = clean(
			"Feed post number 15 Coursera commented on this It's kind of wild.",
		);
		expect(cleaned).toBe("it's kind of wild.");
	});

	it("strips trailing social counts and action bar labels", () => {
		const cleaned = clean(
			"My post body 33 reactions 13 comments like comment repost send",
		);
		expect(cleaned).toBe("my post body");
	});

	it("preserves normal prose that includes like/comment words", () => {
		const cleaned = clean(
			"I like this approach and you can comment if you disagree.",
		);
		expect(cleaned).toBe(
			"i like this approach and you can comment if you disagree.",
		);
	});

	it("strips job-update labels and automated reaction suggestion tails", () => {
		const cleaned = clean(
			"eleni pappa\u2019s job update eleni completed 4 years at noris mike 7 3 comments like comment congratulations! excited for you well deserved, eleni wishing you the best",
		);
		expect(cleaned).toBe("eleni completed 4 years at noris mike");
	});

	it("strips duplicated actor header, following/verified tags, and visibility metadata", () => {
		const cleaned = clean(
			"simon heatonsimon heaton • followingverified • following director of growth marketing @ buffer director of growth marketing @ buffer 1w • 1 week ago • visible to anyone on or off linkedin we're hiring a senior data scientist at buffer! ...more 144 19 comments 11 reposts",
		);
		expect(cleaned).toBe("we're hiring a senior data scientist at buffer!");
	});

	it("strips duplicated follower/time metadata and loading UI noise", () => {
		const cleaned = clean(
			"softetasofteta 9,425 followers9,425 followers 7m • 7 minutes ago • visible to anyone on or off linkedin we stand out because we put you first. ...more your document is loading",
		);
		expect(cleaned).toBe("we stand out because we put you first.");
	});

	it("strips promoted headers and download/view-form control tails", () => {
		const cleaned = clean(
			"kalimera.aikalimera.ai 497 followers497 followers promotedpromoted reduce your airline operating costs by up to 60%! ...more download free whitepaper kalimera.ai download. view form download 6 1",
		);
		expect(cleaned).toBe("reduce your airline operating costs by up to 60%!");
	});

	it("strips load-more-comments action rows", () => {
		const cleaned = clean("my post body like reply load more comments");
		expect(cleaned).toBe("my post body");
	});

	it("strips following/verified metadata that precedes content", () => {
		const cleaned = clean("followingverified • following real post body");
		expect(cleaned).toBe("real post body");
	});

	it("strips connection-follow prefix metadata before post body", () => {
		const cleaned = clean(
			"George Spanidis, Nektaria Toto and 51 other connections follow LinkedIn for Marketing this is the real post body",
		);
		expect(cleaned).toBe("this is the real post body");
	});

	it("strips single-actor follows prefix metadata before post body", () => {
		const cleaned = clean(
			"Nektaria Toto follows LinkedIn for Marketing this is the real post body",
		);
		expect(cleaned).toBe("this is the real post body");
	});

	it("strips leaked follow action prefix before post body", () => {
		const cleaned = clean("follow lazy engineers are good engineers");
		expect(cleaned).toBe("lazy engineers are good engineers");
	});

	it("strips leaked follow action prefix in long-form content", () => {
		const cleaned = clean(
			"follow coding isn't dying. bad developers are.the head of claude",
		);
		expect(cleaned).toBe(
			"coding isn't dying. bad developers are.the head of claude",
		);
	});

	it("preserves natural follow-up prose at sentence start", () => {
		const cleaned = clean(
			"follow up with the release team tomorrow morning please",
		);
		expect(cleaned).toBe(
			"follow up with the release team tomorrow morning please",
		);
	});

	it("normalizes pipe separators used in metadata prefixes", () => {
		const cleaned = clean("followingverified | following | real post body");
		expect(cleaned).toBe("real post body");
	});

	it("strips verified + connection-degree metadata before post body", () => {
		const cleaned = clean(
			"dr. ashish bamania • 2ndverified • 2nd we shipped a better onboarding flow this week",
		);
		expect(cleaned).toBe("we shipped a better onboarding flow this week");
	});

	it("drops metadata-only verified + connection-degree strings", () => {
		const cleaned = clean("dr. ashish bamania • 2ndverified • 2nd");
		expect(cleaned).toBe("");
	});

	it("drops metadata-only follows activity strings", () => {
		const cleaned = clean(
			"Anna Christina Kyratzoglou follows FranklinCovey Greece and Cyprus",
		);
		expect(cleaned).toBe("");
	});

	it("strips follows activity prefix when a body is present", () => {
		const cleaned = clean(
			"Anna Christina Kyratzoglou follows FranklinCovey Greece and Cyprus we are hiring backend engineers in athens",
		);
		expect(cleaned).toBe("we are hiring backend engineers in athens");
	});

	it("preserves normal prose with congratulations language", () => {
		const cleaned = clean(
			"We said congratulations to the team and wishing you the best in public.",
		);
		expect(cleaned).toBe(
			"we said congratulations to the team and wishing you the best in public.",
		);
	});

	it("falls back to normalized text when stripping would leave only a tiny fragment", () => {
		const rawText =
			"status ok like comment congratulations! excited for you well deserved wishing you the best";
		const cleaned = clean(rawText);
		expect(cleaned).toBe(rawText);
	});

	it("preserves follow wording inside normal prose", () => {
		const cleaned = clean(
			"We follow market updates and follow up with customers every week.",
		);
		expect(cleaned).toBe(
			"we follow market updates and follow up with customers every week.",
		);
	});
});
