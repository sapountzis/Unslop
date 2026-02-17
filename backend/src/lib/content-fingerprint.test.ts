import { describe, expect, it } from "bun:test";
import { computeContentFingerprint } from "./content-fingerprint";

const basePost = {
	post_id: "urn:li:activity:123",
	author_id: "author-123",
	author_name: "Test Author",
	nodes: [
		{
			id: "root",
			parent_id: null,
			kind: "root",
			ordinal: 0,
			text: "Root text",
		},
		{
			id: "repost-0",
			parent_id: "root",
			kind: "repost",
			ordinal: 1,
			text: "Nested text",
		},
	],
	attachments: [
		{
			node_id: "root",
			ordinal: 0,
			kind: "image",
			sha256: "img-a",
			mime_type: "image/jpeg",
			base64: "Zm9v",
		},
		{
			node_id: "root",
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
			author_id: basePost.author_id,
			author_name: basePost.author_name,
			nodes: basePost.nodes,
			attachments: basePost.attachments,
		};

		const payloadB = {
			author_name: basePost.author_name,
			author_id: basePost.author_id,
			post_id: basePost.post_id,
			attachments: [
				{
					kind: "image",
					base64: "Zm9v",
					mime_type: "image/jpeg",
					sha256: "img-a",
					ordinal: 0,
					node_id: "root",
				},
				{
					excerpt_text: "Doc excerpt",
					source_url: "https://media.example/doc",
					kind: "pdf",
					node_id: "root",
					ordinal: 1,
				},
			],
			nodes: [
				{
					text: "Root text",
					kind: "root",
					id: "root",
					parent_id: null,
					ordinal: 0,
				},
				{
					ordinal: 1,
					id: "repost-0",
					parent_id: "root",
					text: "Nested text",
					kind: "repost",
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
					node_id: "root",
					ordinal: 0,
					kind: "image",
					sha256: "img-a",
					mime_type: "image/jpeg",
					base64: "a",
				},
				{
					node_id: "root",
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
					node_id: "root",
					ordinal: 0,
					kind: "image",
					sha256: "img-b",
					mime_type: "image/jpeg",
					base64: "b",
				},
				{
					node_id: "root",
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

	it("normalizes text-node whitespace and case before hashing", () => {
		const noisy = {
			...basePost,
			nodes: [
				{
					id: "root",
					parent_id: null,
					kind: "root",
					ordinal: 0,
					text: "  HELLO   World\n\nFROM   LinkedIn  ",
				},
				{
					id: "repost-0",
					parent_id: "root",
					kind: "repost",
					ordinal: 1,
					text: " RePost   BLOCK ",
				},
			],
		};

		const normalized = {
			...basePost,
			nodes: [
				{
					id: "root",
					parent_id: null,
					kind: "root",
					ordinal: 0,
					text: "hello world from linkedin",
				},
				{
					id: "repost-0",
					parent_id: "root",
					kind: "repost",
					ordinal: 1,
					text: "repost block",
				},
			],
		};

		expect(computeContentFingerprint(noisy)).toBe(
			computeContentFingerprint(normalized),
		);
	});
});
