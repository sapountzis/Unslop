// extension/src/background/llmClient.ts
// Typed OpenAI-compatible BYOK client for direct keep/hide classification.

import OpenAI from "openai";
import { z } from "zod";
import {
	FETCH_TIMEOUT_MS,
	LLM_MAX_TOKENS,
	LLM_TEMPERATURE,
} from "../lib/config";
import { SYSTEM_PROMPT, constructUserPrompt } from "../lib/prompts";
import type { Decision, PostData } from "../types";
import type {
	ChatCompletionContentPart,
	ChatCompletionMessageParam,
} from "openai/resources/chat/completions";

export interface ProviderSettings {
	apiKey: string;
	baseUrl: string;
	model: string;
}

export interface LlmCallResult {
	decision: Decision | null;
	source: "llm" | "error";
	model: string;
}

const RETRY_DELAY_MS = 1000;
const MAX_RETRY_ATTEMPTS = 2;
const EPHEMERAL_CACHE_HOSTS = ["openrouter.ai"] as const;

const DecisionSchema = z.object({
	decision: z.enum(["keep", "hide"]),
});

interface ImageContentPart {
	type: "image_url";
	image_url: { url: string; detail: "low" };
}

interface TextContentPart {
	type: "text";
	text: string;
}

type ContentPart = TextContentPart | ImageContentPart;

function resolveApiBaseUrl(baseUrl: string): string {
	return baseUrl.replace(/\/+$/, "");
}

function buildImageParts(post: PostData): ImageContentPart[] {
	return post.attachments
		.filter(
			(
				attachment,
			): attachment is Extract<
				typeof attachment,
				{ kind: "image"; base64: string; mime_type: string }
			> =>
				attachment.kind === "image" &&
				"base64" in attachment &&
				typeof (attachment as { base64?: unknown }).base64 === "string",
		)
		.slice(0, 4)
		.map((attachment) => {
			const base64 = attachment.base64.replace(/\s/g, "").trim();
			const mime = (attachment.mime_type ?? "image/jpeg").trim();
			return {
				type: "image_url" as const,
				image_url: {
					url: `data:${mime};base64,${base64}`,
					detail: "low" as const,
				},
			};
		});
}

function buildMessages(
	post: PostData,
	options: { includeEphemeralCacheHint: boolean },
): ChatCompletionMessageParam[] {
	const userText = constructUserPrompt({
		text: post.text,
		attachments: post.attachments.map((attachment, i) => ({
			kind: attachment.kind,
			ordinal: (attachment as { ordinal?: number }).ordinal ?? i,
			mime_type: (attachment as { mime_type?: string }).mime_type,
			sha256: (attachment as { sha256?: string }).sha256,
			source_url: (attachment as { source_url?: string }).source_url,
			excerpt_text: (attachment as { excerpt_text?: string }).excerpt_text,
		})),
	});

	const imageParts = buildImageParts(post);
	const userContent: ChatCompletionContentPart[] = [
		{ type: "text", text: userText },
		...imageParts,
	];

	const systemMessage = options.includeEphemeralCacheHint
		? ({
				role: "system",
				content: SYSTEM_PROMPT,
				cache_control: { type: "ephemeral" },
			} as ChatCompletionMessageParam)
		: ({ role: "system", content: SYSTEM_PROMPT } as ChatCompletionMessageParam);

	return [systemMessage, { role: "user", content: userContent }];
}

function parseDecision(content: string | null): Decision | null {
	if (!content) return null;

	try {
		const cleaned = content.replace(/```(?:json)?/gi, "").trim();
		const parsed = JSON.parse(cleaned);
		const result = DecisionSchema.safeParse(parsed);
		if (!result.success) return null;
		return result.data.decision;
	} catch {
		return null;
	}
}

function resolveErrorStatus(error: unknown): number | null {
	if (typeof error !== "object" || error === null) return null;
	const status = Reflect.get(error, "status");
	return typeof status === "number" ? status : null;
}

function resolveErrorMessage(error: unknown): string {
	if (error instanceof Error && error.message.length > 0) {
		return error.message;
	}
	return String(error);
}

function isAuthError(error: unknown): boolean {
	const status = resolveErrorStatus(error);
	return status === 401 || status === 403;
}

function isNoRetryError(error: unknown): boolean {
	if (typeof error !== "object" || error === null) return false;
	return Reflect.get(error, "noRetry") === true;
}

function extractProviderErrorMessage(error: unknown): string {
	if (!(error instanceof Error)) return String(error);

	const rawBody = Reflect.get(error as object, "error");
	if (rawBody && typeof rawBody === "object") {
		const body = rawBody as Record<string, unknown>;
		if (typeof body.message === "string" && body.message.length > 0) {
			return body.message;
		}
	}

	return error.message;
}

function isCacheControlUnsupportedError(error: unknown): boolean {
	const status = resolveErrorStatus(error);
	if (status !== 400) return false;

	const providerMessage = extractProviderErrorMessage(error).toLowerCase();
	return (
		providerMessage.includes("cache_control") ||
		providerMessage.includes("unknown parameter") ||
		providerMessage.includes("unrecognized") ||
		providerMessage.includes("additional properties")
	);
}

function shouldUseEphemeralCacheHint(baseUrl: string): boolean {
	try {
		const url = new URL(baseUrl);
		const hostname = url.hostname.toLowerCase();
		return EPHEMERAL_CACHE_HOSTS.some(
			(host) => hostname === host || hostname.endsWith(`.${host}`),
		);
	} catch {
		return false;
	}
}

async function callLlmOnce(
	settings: ProviderSettings,
	post: PostData,
	options: { includeEphemeralCacheHint: boolean },
): Promise<LlmCallResult> {
	const client = new OpenAI({
		apiKey: settings.apiKey,
		baseURL: resolveApiBaseUrl(settings.baseUrl),
		timeout: FETCH_TIMEOUT_MS,
		maxRetries: 0,
		dangerouslyAllowBrowser: true,
	});

	const completion = await client.chat.completions.create({
		model: settings.model,
		messages: buildMessages(post, options),
		temperature: LLM_TEMPERATURE,
		max_tokens: LLM_MAX_TOKENS,
		response_format: { type: "json_object" },
	});

	const content = completion.choices[0]?.message?.content ?? null;
	const decision = parseDecision(content);
	if (!decision) {
		throw Object.assign(
			new Error("LLM response did not contain a valid decision JSON object"),
			{ noRetry: true },
		);
	}

	return { decision, source: "llm", model: settings.model };
}

async function classifyWithRetry(
	settings: ProviderSettings,
	post: PostData,
	options: { includeEphemeralCacheHint: boolean },
): Promise<LlmCallResult> {
	let lastError: unknown;

	for (let attempt = 0; attempt < MAX_RETRY_ATTEMPTS; attempt++) {
		try {
			return await callLlmOnce(settings, post, options);
		} catch (error) {
			lastError = error;

			if (isAuthError(error)) {
				throw error;
			}
			if (isNoRetryError(error)) {
				throw error;
			}

			// Switch to a no-hint retry path immediately for providers that reject cache_control.
			if (
				options.includeEphemeralCacheHint &&
				isCacheControlUnsupportedError(error)
			) {
				throw error;
			}

			const hasRemainingAttempt = attempt < MAX_RETRY_ATTEMPTS - 1;
			if (hasRemainingAttempt) {
				await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
			}
		}
	}

	throw lastError ?? new Error("LLM request failed");
}

/**
 * Classify a single post via user-configured OpenAI-compatible endpoint.
 * Returns fail-open `{ decision: null, source: "error" }` on any failure.
 */
export async function classifyPostWithLlm(
	settings: ProviderSettings,
	post: PostData,
): Promise<LlmCallResult> {
	const includeEphemeralCacheHint = shouldUseEphemeralCacheHint(settings.baseUrl);
	let lastError: unknown;

	try {
		return await classifyWithRetry(settings, post, {
			includeEphemeralCacheHint,
		});
	} catch (error) {
		lastError = error;
	}

	if (
		includeEphemeralCacheHint &&
		isCacheControlUnsupportedError(lastError)
	) {
		try {
			return await classifyWithRetry(settings, post, {
				includeEphemeralCacheHint: false,
			});
		} catch (error) {
			lastError = error;
		}
	}

	console.error("[Unslop][llm] classify failed:", resolveErrorMessage(lastError));
	return { decision: null, source: "error", model: settings.model };
}
