import { describe, expect, it } from "bun:test";
import type OpenAI from "openai";
import {
	buildMessages,
	callModel,
	constructUserPrompt,
	createLlmService,
	parseAndValidateResponse,
	selectModelForPayload,
	type PostInput,
} from "./llm";
import type { AppLogger } from "../lib/logger-types";

const testLogger: Pick<AppLogger, "warn" | "error"> = {
	warn: () => {},
	error: () => {},
};

const testConfig = {
	apiKey: "test-key",
	textModel: "text-model-1",
	vlmModel: "vlm-model-1",
	baseUrl: "https://example.com",
};

function createOpenAiCapture() {
	let model: string | null = null;
	let userContent: unknown = null;

	const openai = {
		chat: {
			completions: {
				parse: async (params: {
					model: string;
					messages: Array<{ role: string; content: unknown }>;
				}) => {
					model = params.model;
					const userMessage = params.messages.find(
						(message) => message.role === "user",
					);
					userContent = userMessage?.content;
					return {
						choices: [
							{
								message: {
									refusal: null,
									parsed: {
										signal: 0.0,
										manipulation: 0.0,
										template: 0.0,
									},
								},
							},
						],
					};
				},
			},
		},
	} as unknown as OpenAI;

	return {
		openai,
		getModel: () => model,
		getUserContent: () => userContent,
	};
}

function makeTextPost(): PostInput {
	return {
		post_id: "post-1",
		text: "Root post text. Repost context.",
		attachments: [],
	};
}

function makeMultimodalPost(): PostInput {
	return {
		post_id: "post-2",
		text: "Main post body.",
		attachments: [
			{
				ordinal: 0,
				kind: "image",
				sha256: "a".repeat(64),
				mime_type: "image/jpeg",
				base64: "/9j/4AAQSkZJRgABAQAAAQABAAD",
			},
			{
				ordinal: 1,
				kind: "pdf",
				source_url: "https://example.com/guide.pdf",
				excerpt_text: "Important PDF excerpt.",
			},
		],
	};
}

function makePdfOnlyPost(): PostInput {
	return {
		post_id: "post-3",
		text: "PDF backed text context.",
		attachments: [
			{
				ordinal: 0,
				kind: "pdf",
				source_url: "https://example.com/report.pdf",
				excerpt_text: "PDF excerpt only.",
			},
		],
	};
}

async function skipIfNoRealLlmKey(): Promise<boolean> {
	if (process.env.RUN_REAL_LLM_INTEGRATION !== "true") {
		console.log(
			"Skipping llm integration test: set RUN_REAL_LLM_INTEGRATION=true to enable.",
		);
		return true;
	}
	if (
		!process.env.LLM_API_KEY ||
		process.env.LLM_API_KEY.startsWith("sk-or-dummy")
	) {
		console.log(
			"Skipping llm integration test: no real LLM_API_KEY is configured.",
		);
		return true;
	}
	if (!process.env.LLM_MODEL) {
		console.log("Skipping llm integration test: LLM_MODEL is not configured.");
		return true;
	}
	return false;
}

describe("LLM Service (integration)", () => {
	it("single prompt includes post text context", () => {
		const prompt = constructUserPrompt(makeTextPost());

		expect(prompt).toContain("POST TO ANALYZE:");
		expect(prompt).toContain("POST:");
		expect(prompt).toContain("Root post text.");
		expect(prompt).toContain("Repost context.");
		expect(prompt).not.toContain("ATTACHMENTS:");
	});

	it("single prompt includes attachment context only when attachments exist", () => {
		const prompt = constructUserPrompt(makeMultimodalPost());

		expect(prompt).toContain("POST TO ANALYZE:");
		expect(prompt).toContain("ATTACHMENTS:");
		expect(prompt).toContain("[image 1]");
		expect(prompt).toContain("[pdf 2]");
		expect(prompt).toContain("Important PDF excerpt.");
	});

	it("buildMessages always returns a single user content-parts array and includes image_url parts when present", () => {
		const messages = buildMessages(makeMultimodalPost());
		const userMessage = messages.find((message) => message.role === "user");

		if (!userMessage || typeof userMessage.content === "string") {
			throw new Error("Expected user content parts");
		}

		const textPart = userMessage.content.find((part) => part.type === "text");
		expect(textPart).toBeDefined();
		if (!textPart || textPart.type !== "text") {
			throw new Error("Expected text content part");
		}

		const imagePart = userMessage.content.find(
			(part) => part.type === "image_url",
		);
		expect(imagePart).toBeDefined();
		if (!imagePart || imagePart.type !== "image_url") {
			throw new Error("Expected image_url content part");
		}

		expect(imagePart.image_url.url.startsWith("data:image/jpeg;base64,")).toBe(
			true,
		);
	});

	it("buildMessages omits image parts when no images are present", () => {
		const messages = buildMessages(makePdfOnlyPost());
		const userMessage = messages.find((message) => message.role === "user");

		if (!userMessage || typeof userMessage.content === "string") {
			throw new Error("Expected user content parts");
		}

		const imagePart = userMessage.content.find(
			(part) => part.type === "image_url",
		);
		expect(imagePart).toBeUndefined();
	});

	it("preserves output score object losslessly", () => {
		const payload = {
			signal: 0.1,
			manipulation: 0.2,
			template: 0.3,
		};

		const parsed = parseAndValidateResponse(JSON.stringify(payload));
		expect(parsed).toEqual(payload);
	});

	it("callModel uses text model when input has no images", async () => {
		const capture = createOpenAiCapture();
		await callModel(capture.openai, testConfig, makeTextPost(), testLogger);

		if (capture.getModel() === null) {
			throw new Error("expected text model capture");
		}
		const selectedTextModel = String(capture.getModel());
		expect(selectedTextModel).toBe("text-model-1");
		expect(Array.isArray(capture.getUserContent())).toBe(true);
	});

	it("callModel uses vlm model and includes image content parts when images exist", async () => {
		const capture = createOpenAiCapture();
		await callModel(
			capture.openai,
			testConfig,
			makeMultimodalPost(),
			testLogger,
		);

		if (capture.getModel() === null) {
			throw new Error("expected multimodal model capture");
		}
		const selectedVlmModel = String(capture.getModel());
		expect(selectedVlmModel).toBe("vlm-model-1");
		expect(Array.isArray(capture.getUserContent())).toBe(true);
		const userContent = capture.getUserContent();
		if (!Array.isArray(userContent)) {
			throw new Error("Expected content parts array");
		}

		const imagePart = userContent.find(
			(part: unknown) =>
				typeof part === "object" &&
				part !== null &&
				(part as { type?: string }).type === "image_url",
		);
		expect(imagePart).toBeDefined();
	});

	it("callModel routes pdf-only attachments to vlm model", async () => {
		const capture = createOpenAiCapture();
		await callModel(capture.openai, testConfig, makePdfOnlyPost(), testLogger);

		if (capture.getModel() === null) {
			throw new Error("expected multimodal model capture for pdf-only payload");
		}

		expect(String(capture.getModel())).toBe("vlm-model-1");
	});

	it("selectModelForPayload routes by attachment presence", () => {
		const textOnly = makeTextPost();
		const withAttachment = makeMultimodalPost();
		const pdfOnly = makePdfOnlyPost();

		expect(selectModelForPayload(textOnly, testConfig)).toBe("text-model-1");
		expect(selectModelForPayload(withAttachment, testConfig)).toBe(
			"vlm-model-1",
		);
		expect(selectModelForPayload(pdfOnly, testConfig)).toBe("vlm-model-1");
	});

	it("classifies a post using the configured provider", async () => {
		if (await skipIfNoRealLlmKey()) return;

		const llmService = createLlmService({
			config: {
				apiKey: process.env.LLM_API_KEY || "",
				textModel: process.env.LLM_MODEL || "",
				vlmModel: process.env.VLM_MODEL || "",
				baseUrl: process.env.LLM_BASE_URL || "https://openrouter.ai/api/v1",
			},
			logger: testLogger,
		});

		const result = await llmService.classifyPost({
			post_id: "test-post-1",
			text: "Just published my new course on how to 10x your productivity! Link in bio. #hustle #grindset",
			attachments: [],
		});

		expect(result.source).toBe("llm");
		expect(result.model).toBe(process.env.LLM_MODEL!);
		expect(result.latency).toBeGreaterThan(0);
		expect(result.scores).not.toBeNull();

		const { ScoringEngine } = await import("./scoring");
		const engine = new ScoringEngine();
		const scored = engine.score(result.scores);
		expect(["keep", "hide"]).toContain(scored.decision);
	}, 30000);
});
