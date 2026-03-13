import { describe, expect, it } from "bun:test";
import { buildClassificationCacheKey } from "./hash";

describe("buildClassificationCacheKey", () => {
	it("is deterministic for equivalent normalized content", async () => {
		const first = await buildClassificationCacheKey({
			text: " Hello   World ",
			attachments: [{ kind: "image", src: "https://cdn.example.com/a.png?x=1", alt: "" }],
		});
		const second = await buildClassificationCacheKey({
			text: "hello world",
			attachments: [{ kind: "image", src: "https://cdn.example.com/a.png?x=2", alt: "" }],
		});

		expect(first).toBe(second);
		expect(first).toMatch(/^[a-f0-9]{64}$/);
	});

	it("changes when text content changes", async () => {
		const first = await buildClassificationCacheKey({
			text: "alpha",
			attachments: [],
		});
		const second = await buildClassificationCacheKey({
			text: "beta",
			attachments: [],
		});

		expect(first).not.toBe(second);
	});

	it("changes when attachment descriptors change", async () => {
		const first = await buildClassificationCacheKey({
			text: "same text",
			attachments: [{ kind: "image", src: "https://cdn.example.com/a.png", alt: "" }],
		});
		const second = await buildClassificationCacheKey({
			text: "same text",
			attachments: [{ kind: "image", src: "https://cdn.example.com/b.png", alt: "" }],
		});

		expect(first).not.toBe(second);
	});
});
