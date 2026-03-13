import { afterEach, describe, expect, it } from "bun:test";
import { classifyPostWithLlm } from "./llmClient";

const originalFetch = globalThis.fetch;

type FetchInput = string | URL | Request;

function resolveUrl(input: FetchInput): string {
	if (typeof input === "string") return input;
	if (input instanceof URL) return input.toString();
	return input.url;
}

async function readJsonBody(
	input: FetchInput,
	init?: RequestInit,
): Promise<Record<string, unknown>> {
	if (typeof init?.body === "string") {
		return JSON.parse(init.body) as Record<string, unknown>;
	}
	if (input instanceof Request) {
		const text = await input.clone().text();
		return text.length > 0
			? (JSON.parse(text) as Record<string, unknown>)
			: {};
	}
	return {};
}

afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe("llmClient", () => {
	it("uses configured base URL as-is for chat/completions", async () => {
		let requestedUrl = "";
		globalThis.fetch = (async (input) => {
			requestedUrl = resolveUrl(input as FetchInput);
			return new Response(
				JSON.stringify({
					choices: [{ message: { content: '{"decision":"keep"}' } }],
				}),
				{ status: 200, headers: { "content-type": "application/json" } },
			);
		}) as typeof fetch;

		const result = await classifyPostWithLlm(
			{
				apiKey: "sk-test",
				baseUrl: "https://openrouter.ai/api/v1/",
				model: "openai/gpt-4o-mini",
			},
			{ post_id: "p1", text: "test post", attachments: [] },
		);

		expect(requestedUrl).toBe("https://openrouter.ai/api/v1/chat/completions");
		expect(result).toEqual({
			decision: "keep",
			source: "llm",
			model: "openai/gpt-4o-mini",
		});
	});

	it("includes ephemeral cache hint for known compatible hosts", async () => {
		let requestBody: Record<string, unknown> = {};
		globalThis.fetch = (async (input, init) => {
			requestBody = await readJsonBody(input as FetchInput, init);
			return new Response(
				JSON.stringify({
					choices: [{ message: { content: '{"decision":"hide"}' } }],
				}),
				{ status: 200, headers: { "content-type": "application/json" } },
			);
		}) as typeof fetch;

		await classifyPostWithLlm(
			{
				apiKey: "sk-test",
				baseUrl: "https://openrouter.ai/api/v1",
				model: "openai/gpt-4o-mini",
			},
			{ post_id: "p1", text: "test post", attachments: [] },
		);

		const messages = requestBody.messages as Array<Record<string, unknown>>;
		expect(Array.isArray(messages)).toBe(true);
		expect(messages[0]?.cache_control).toEqual({ type: "ephemeral" });
	});

	it("omits ephemeral cache hint for unknown/other hosts", async () => {
		let requestBody: Record<string, unknown> = {};
		globalThis.fetch = (async (input, init) => {
			requestBody = await readJsonBody(input as FetchInput, init);
			return new Response(
				JSON.stringify({
					choices: [{ message: { content: '{"decision":"hide"}' } }],
				}),
				{ status: 200, headers: { "content-type": "application/json" } },
			);
		}) as typeof fetch;

		await classifyPostWithLlm(
			{
				apiKey: "sk-test",
				baseUrl: "https://api.openai.com",
				model: "gpt-4.1-mini",
			},
			{ post_id: "p1", text: "test post", attachments: [] },
		);

		const messages = requestBody.messages as Array<Record<string, unknown>>;
		expect(Array.isArray(messages)).toBe(true);
		expect(messages[0] && "cache_control" in messages[0]).toBe(false);
	});

	it("falls back to no cache hint when provider rejects cache_control", async () => {
		const requestBodies: Array<Record<string, unknown>> = [];
		let callCount = 0;
		globalThis.fetch = (async (input, init) => {
			callCount += 1;
			requestBodies.push(await readJsonBody(input as FetchInput, init));

			if (callCount === 1) {
				return new Response(
					JSON.stringify({
						error: {
							message: "Unrecognized request argument supplied: cache_control",
						},
					}),
					{ status: 400, headers: { "content-type": "application/json" } },
				);
			}

			return new Response(
				JSON.stringify({
					choices: [{ message: { content: '{"decision":"keep"}' } }],
				}),
				{ status: 200, headers: { "content-type": "application/json" } },
			);
		}) as typeof fetch;

		const result = await classifyPostWithLlm(
			{
				apiKey: "sk-test",
				baseUrl: "https://openrouter.ai/api/v1",
				model: "openai/gpt-4o-mini",
			},
			{ post_id: "p1", text: "test post", attachments: [] },
		);

		expect(callCount).toBe(2);
		expect(result.source).toBe("llm");
		expect((requestBodies[0]?.messages as Array<Record<string, unknown>>)[0]?.cache_control).toEqual({
			type: "ephemeral",
		});
		expect("cache_control" in (requestBodies[1]?.messages as Array<Record<string, unknown>>)[0]!).toBe(
			false,
		);
	});

	it("returns fail-open error result when model response is malformed", async () => {
		globalThis.fetch = (async () => {
			return new Response(
				JSON.stringify({
					choices: [{ message: { content: "not-json" } }],
				}),
				{ status: 200, headers: { "content-type": "application/json" } },
			);
		}) as typeof fetch;

		const result = await classifyPostWithLlm(
			{
				apiKey: "sk-test",
				baseUrl: "https://api.openai.com",
				model: "gpt-4.1-mini",
			},
			{ post_id: "p1", text: "test post", attachments: [] },
		);

		expect(result).toEqual({
			decision: null,
			source: "error",
			model: "gpt-4.1-mini",
		});
	});
});

