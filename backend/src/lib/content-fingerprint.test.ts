import { describe, expect, it } from "bun:test";
import { computeContentFingerprint } from "./content-fingerprint";

const basePost = {
	post_id: "urn:li:activity:123",
	text: "Root text Nested text",
	attachments: [
		{
			ordinal: 0,
			kind: "image",
			sha256: "img-a",
			mime_type: "image/jpeg",
			base64: "Zm9v",
		},
		{
			ordinal: 1,
			kind: "pdf",
			source_url: "https://media.example/doc",
			excerpt_text: "Doc excerpt",
		},
	],
};

describe("computeContentFingerprint", () => {
	it("returns the same fingerprint when object keys are reordered for the same logical payload", () => {
		const payloadA = {
			post_id: basePost.post_id,
			text: basePost.text,
			attachments: basePost.attachments,
		};

		const payloadB = {
			post_id: basePost.post_id,
			text: basePost.text,
			attachments: [
				{
					kind: "image",
					base64: "Zm9v",
					mime_type: "image/jpeg",
					sha256: "img-a",
					ordinal: 0,
				},
				{
					excerpt_text: "Doc excerpt",
					source_url: "https://media.example/doc",
					kind: "pdf",
					ordinal: 1,
				},
			],
		};

		expect(computeContentFingerprint(payloadA)).toBe(
			computeContentFingerprint(payloadB),
		);
	});

	it("changes fingerprint when attachment order semantics change", () => {
		const first = {
			...basePost,
			attachments: [
				{
					ordinal: 0,
					kind: "image",
					sha256: "img-a",
					mime_type: "image/jpeg",
					base64: "a",
				},
				{
					ordinal: 1,
					kind: "image",
					sha256: "img-b",
					mime_type: "image/jpeg",
					base64: "b",
				},
			],
		};

		const second = {
			...basePost,
			attachments: [
				{
					ordinal: 0,
					kind: "image",
					sha256: "img-b",
					mime_type: "image/jpeg",
					base64: "b",
				},
				{
					ordinal: 1,
					kind: "image",
					sha256: "img-a",
					mime_type: "image/jpeg",
					base64: "a",
				},
			],
		};

		expect(computeContentFingerprint(first)).not.toBe(
			computeContentFingerprint(second),
		);
	});

	it("normalizes text whitespace and case before hashing", () => {
		const noisy = {
			...basePost,
			text: "  HELLO   World\n\nFROM   LinkedIn  RePost   BLOCK ",
		};

		const normalized = {
			...basePost,
			text: "hello world from linkedin repost block",
		};

		expect(computeContentFingerprint(noisy)).toBe(
			computeContentFingerprint(normalized),
		);
	});
});
