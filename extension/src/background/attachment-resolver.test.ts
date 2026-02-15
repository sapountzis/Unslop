import { describe, expect, it } from "bun:test";
import {
	resolveBatchAttachmentPayload,
	resizeImageIfNeeded,
} from "./attachment-resolver";

const BASE_POST = {
	post_id: "urn:li:activity:test-post",
	author_id: "author-1",
	author_name: "Author One",
	nodes: [
		{ id: "root", parent_id: null, kind: "root" as const, text: "hello world" },
	],
};

describe("resolveBatchAttachmentPayload", () => {
	it("resolves image fetch into sha256 hex + base64 + mime_type", async () => {
		const request = {
			posts: [
				{
					...BASE_POST,
					attachments: [
						{
							node_id: "root",
							kind: "image" as const,
							source_url: "https://media.licdn.com/dms/image/test-image",
						},
					],
				},
			],
		};

		const responseBytes = new TextEncoder().encode("abc");
		const resolved = await resolveBatchAttachmentPayload(request, {
			fetch: async () =>
				new Response(responseBytes, {
					status: 200,
					headers: { "content-type": "image/png; charset=binary" },
				}),
		});

		const image = resolved.posts[0]?.attachments[0];
		expect(image).toEqual({
			node_id: "root",
			kind: "image",
			sha256:
				"ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
			mime_type: "image/png",
			base64: "YWJj",
		});
	});

	it("keeps pdf attachment with empty excerpt when extraction is unavailable", async () => {
		const request = {
			posts: [
				{
					...BASE_POST,
					attachments: [
						{
							node_id: "root",
							kind: "pdf" as const,
							source_url: "https://media.licdn.com/dms/document/test.pdf",
						},
					],
				},
			],
		};

		const resolved = await resolveBatchAttachmentPayload(request, {
			fetch: async () =>
				new Response(new Uint8Array([0x25, 0x50, 0x44, 0x46]), {
					status: 200,
					headers: { "content-type": "application/pdf" },
				}),
		});

		expect(resolved.posts[0]?.attachments).toEqual([
			{
				node_id: "root",
				kind: "pdf",
				source_url: "https://media.licdn.com/dms/document/test.pdf",
				excerpt_text: "",
			},
		]);
	});

	it("resolves parser-emitted pdf refs into source_url", async () => {
		const request = {
			posts: [
				{
					...BASE_POST,
					attachments: [
						{
							node_id: "root",
							kind: "pdf" as const,
							iframe_src: "https://media.licdn.com/doc/iframe",
							container_data_url: "https://media.licdn.com/doc/container",
							source_hint: "https://media.licdn.com/doc/hint",
						},
					],
				},
			],
		};

		const resolved = await resolveBatchAttachmentPayload(request, {
			fetch: async () => new Response("", { status: 200 }),
		});

		expect(resolved.posts[0]?.attachments[0]).toEqual(
			expect.objectContaining({
				kind: "pdf",
				source_url: expect.any(String),
			}),
		);
	});

	it("drops parser pdf refs when no valid http source url is present", async () => {
		const request = {
			posts: [
				{
					...BASE_POST,
					attachments: [
						{
							node_id: "root",
							kind: "pdf" as const,
							source_hint: "feedshare-document",
						},
					],
				},
			],
		};

		const resolved = await resolveBatchAttachmentPayload(request, {
			fetch: async () => new Response("", { status: 200 }),
		});

		expect(resolved.posts[0]?.attachments).toEqual([]);
	});

	it("returns partial payload and never throws when individual attachments fail", async () => {
		const request = {
			posts: [
				{
					...BASE_POST,
					attachments: [
						{
							node_id: "root",
							kind: "image" as const,
							source_url: "https://media.licdn.com/dms/image/bad-image",
						},
						{
							node_id: "root",
							kind: "pdf" as const,
							source_url: "https://media.licdn.com/dms/document/unreadable.pdf",
						},
						{
							node_id: "root",
							kind: "image" as const,
							source_url: "https://media.licdn.com/dms/image/good-image",
						},
					],
				},
			],
		};

		const resolved = await resolveBatchAttachmentPayload(request, {
			fetch: async (input: RequestInfo | URL) => {
				const url =
					typeof input === "string"
						? input
						: input instanceof URL
							? input.toString()
							: input.url;
				if (url.includes("bad-image")) {
					throw new Error("network error");
				}
				if (url.includes("unreadable.pdf")) {
					throw new Error("pdf extraction failed");
				}
				return new Response(new TextEncoder().encode("good"), {
					status: 200,
					headers: { "content-type": "image/jpeg" },
				});
			},
		});

		expect(resolved.posts).toHaveLength(1);
		expect(resolved.posts[0]?.attachments).toEqual([
			{
				node_id: "root",
				kind: "pdf",
				source_url: "https://media.licdn.com/dms/document/unreadable.pdf",
				excerpt_text: "",
			},
			{
				node_id: "root",
				kind: "image",
				sha256:
					"770e607624d689265ca6c44884d0807d9b054d23c473c106c72be9de08b7376c",
				mime_type: "image/jpeg",
				base64: "Z29vZA==",
			},
		]);
	});

	it("uses custom resize function via dependency injection", async () => {
		const request = {
			posts: [
				{
					...BASE_POST,
					attachments: [
						{
							node_id: "root",
							kind: "image" as const,
							source_url: "https://example.com/image.png",
						},
					],
				},
			],
		};

		const responseBytes = new TextEncoder().encode("original");
		let resizeCalledWith: {
			bytes: Uint8Array;
			maxDim: number;
			mime: string;
		} | null = null;

		const resolved = await resolveBatchAttachmentPayload(request, {
			fetch: async () =>
				new Response(responseBytes, {
					status: 200,
					headers: { "content-type": "image/png" },
				}),
			maxImageDimension: 512,
			resizeImage: async (bytes, maxDimension, mimeType) => {
				resizeCalledWith = { bytes, maxDim: maxDimension, mime: mimeType };
				return {
					bytes: new TextEncoder().encode("resized"),
					mimeType: "image/jpeg",
				};
			},
		});

		expect(resizeCalledWith).toEqual({
			bytes: responseBytes,
			maxDim: 512,
			mime: "image/png",
		});
		expect(resolved.posts[0]?.attachments[0]).toEqual({
			node_id: "root",
			kind: "image",
			sha256:
				"a68a845c9f88421f423dd4c70561d667c156ad9fd64914cf810b3b7a30794bc8",
			mime_type: "image/jpeg",
			base64: "cmVzaXplZA==",
		});
	});
});

describe("resizeImageIfNeeded", () => {
	it("returns original bytes for invalid image data (fail-open)", async () => {
		const invalidBytes = new TextEncoder().encode("not an image");
		const result = await resizeImageIfNeeded(invalidBytes, 1024, "image/png");

		expect(result.bytes).toEqual(invalidBytes);
		expect(result.mimeType).toBe("image/png");
	});
});
