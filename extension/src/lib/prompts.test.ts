import { describe, expect, it } from "bun:test";
import { constructUserPrompt } from "./prompts";

describe("constructUserPrompt", () => {
	it("does not duplicate image attachment metadata in prompt text", () => {
		const prompt = constructUserPrompt({
			text: "Post with image",
			attachments: [
				{
					kind: "image",
					ordinal: 0,
					mime_type: "image/jpeg",
					sha256: "abc123",
				},
			],
		});

		expect(prompt.includes("ATTACHMENTS:")).toBe(false);
		expect(prompt.includes("[image 1]")).toBe(false);
	});

	it("keeps PDF excerpt context in prompt text", () => {
		const prompt = constructUserPrompt({
			text: "Post with pdf",
			attachments: [
				{
					kind: "pdf",
					ordinal: 0,
					source_url: "https://example.com/doc.pdf",
					excerpt_text: "Important appendix details",
				},
			],
		});

		expect(prompt.includes("ATTACHMENTS:")).toBe(true);
		expect(prompt.includes("[pdf 1]")).toBe(true);
		expect(prompt.includes("Important appendix details")).toBe(true);
	});
});
