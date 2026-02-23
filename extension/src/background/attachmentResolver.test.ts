import { describe, expect, it } from "bun:test";
import {
	resolvePostAttachmentPayload,
	resizeImageIfNeeded,
} from "./attachmentResolver";

const BASE_POST = {
	post_id: "urn:li:activity:test-post",
	text: "hello world",
};

/** Minimal 1x1 PNG (valid image for createImageBitmap). */
const MINIMAL_PNG_BYTES = Uint8Array.from(
	atob(
		"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
	),
	(c) => c.charCodeAt(0),
);

describe("resolvePostAttachmentPayload", () => {
	it("resolves image fetch into sha256 hex + base64 + mime_type", async () => {
		const post = {
			...BASE_POST,
			attachments: [
				{
					kind: "image" as const,
					src: "https://media.licdn.com/dms/image/test-image",
					alt: "",
				},
			],
		};

		const resolved = await resolvePostAttachmentPayload(post, {
			fetch: async () =>
				new Response(MINIMAL_PNG_BYTES, {
					status: 200,
					headers: { "content-type": "image/png; charset=binary" },
				}),
			resizeImage: async (bytes) => ({ bytes, mimeType: "image/png" }),
		});

		const image = resolved.attachments[0];
		expect(image).toMatchObject({
			kind: "image",
			mime_type: "image/png",
		});
		expect(image && "sha256" in image && image.sha256).toMatch(
			/^[a-f0-9]{64}$/,
		);
		expect(image && "base64" in image && image.base64).toBeTruthy();
	});

	it("keeps pdf attachment with empty excerpt when extraction is unavailable", async () => {
		const post = {
			...BASE_POST,
			attachments: [
				{
					kind: "pdf" as const,
					source_url: "https://media.licdn.com/dms/document/test.pdf",
				},
			],
		};

		const resolved = await resolvePostAttachmentPayload(post, {
			fetch: async () =>
				new Response(new Uint8Array([0x25, 0x50, 0x44, 0x46]), {
					status: 200,
					headers: { "content-type": "application/pdf" },
				}),
		});

		expect(resolved.attachments).toEqual([
			{
				kind: "pdf",
				source_url: "https://media.licdn.com/dms/document/test.pdf",
				excerpt_text: "",
			},
		]);
	});

	it("resolves parser-emitted pdf refs into source_url", async () => {
		const post = {
			...BASE_POST,
			attachments: [
				{
					kind: "pdf" as const,
					iframe_src: "https://media.licdn.com/doc/iframe",
					container_data_url: "https://media.licdn.com/doc/container",
					source_hint: "https://media.licdn.com/doc/hint",
				},
			],
		};

		const resolved = await resolvePostAttachmentPayload(post, {
			fetch: async () => new Response("", { status: 200 }),
		});

		expect(resolved.attachments[0]).toEqual(
			expect.objectContaining({
				kind: "pdf",
				source_url: expect.any(String),
			}),
		);
	});

	it("drops parser pdf refs when no valid http source url is present", async () => {
		const post = {
			...BASE_POST,
			attachments: [
				{
					kind: "pdf" as const,
					source_hint: "feedshare-document",
				},
			],
		};

		const resolved = await resolvePostAttachmentPayload(post, {
			fetch: async () => new Response("", { status: 200 }),
		});

		expect(resolved.attachments).toEqual([]);
	});

	it("skips image when response is text/html (error page)", async () => {
		const post = {
			...BASE_POST,
			attachments: [
				{
					kind: "image" as const,
					src: "https://example.com/image",
					alt: "",
				},
			],
		};

		const resolved = await resolvePostAttachmentPayload(post, {
			fetch: async () =>
				new Response("<html>404 Not Found</html>", {
					status: 200,
					headers: { "content-type": "text/html" },
				}),
		});

		expect(resolved.attachments).toEqual([]);
	});

	it("skips image when createImageBitmap fails (invalid bytes)", async () => {
		const post = {
			...BASE_POST,
			attachments: [
				{
					kind: "image" as const,
					src: "https://example.com/image",
					alt: "",
				},
			],
		};

		const resolved = await resolvePostAttachmentPayload(post, {
			fetch: async () =>
				new Response(new TextEncoder().encode("not an image"), {
					status: 200,
					headers: { "content-type": "image/jpeg" },
				}),
		});

		expect(resolved.attachments).toEqual([]);
	});

	it("returns partial payload and never throws when individual attachments fail", async () => {
		const post = {
			...BASE_POST,
			attachments: [
				{
					kind: "image" as const,
					src: "https://media.licdn.com/dms/image/bad-image",
					alt: "",
				},
				{
					kind: "pdf" as const,
					source_url: "https://media.licdn.com/dms/document/unreadable.pdf",
				},
				{
					kind: "image" as const,
					src: "https://media.licdn.com/dms/image/good-image",
					alt: "",
				},
			],
		};

		const resolved = await resolvePostAttachmentPayload(post, {
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
				return new Response(MINIMAL_PNG_BYTES, {
					status: 200,
					headers: { "content-type": "image/jpeg" },
				});
			},
			resizeImage: async (bytes) => ({ bytes, mimeType: "image/jpeg" }),
		});

		expect(resolved.attachments).toHaveLength(2);
		expect(resolved.attachments[0]).toEqual({
			kind: "pdf",
			source_url: "https://media.licdn.com/dms/document/unreadable.pdf",
			excerpt_text: "",
		});
		expect(resolved.attachments[1]).toMatchObject({
			kind: "image",
			mime_type: "image/jpeg",
		});
	});

	it("uses custom resize function via dependency injection", async () => {
		const post = {
			...BASE_POST,
			attachments: [
				{
					kind: "image" as const,
					src: "https://example.com/image.png",
					alt: "",
				},
			],
		};

		const responseBytes = new TextEncoder().encode("original");
		let resizeCalledWith: {
			bytes: Uint8Array;
			maxDim: number;
			mime: string;
		} | null = null;

		const resolved = await resolvePostAttachmentPayload(post, {
			fetch: async () =>
				new Response(responseBytes, {
					status: 200,
					headers: { "content-type": "image/png" },
				}),
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
		expect(resolved.attachments[0]).toEqual({
			kind: "image",
			sha256:
				"a68a845c9f88421f423dd4c70561d667c156ad9fd64914cf810b3b7a30794bc8",
			mime_type: "image/jpeg",
			base64: "cmVzaXplZA==",
		});
	});
});

describe("resizeImageIfNeeded", () => {
	it("throws for invalid image data so caller skips attachment", async () => {
		const invalidBytes = new TextEncoder().encode("not an image");
		await expect(
			resizeImageIfNeeded(invalidBytes, 512, "image/png"),
		).rejects.toThrow("image_decode_failed");
	});
});

describe("small image rejection", () => {
	it("skips profile/avatar-sized images (below MIN_IMAGE_DIMENSION)", async () => {
		const post = {
			...BASE_POST,
			attachments: [
				{
					kind: "image" as const,
					src: "https://example.com/avatar.png",
					alt: "",
				},
			],
		};

		const resolved = await resolvePostAttachmentPayload(post, {
			fetch: async () =>
				new Response(MINIMAL_PNG_BYTES, {
					status: 200,
					headers: { "content-type": "image/png" },
				}),
		});

		expect(resolved.attachments).toEqual([]);
	});
});
