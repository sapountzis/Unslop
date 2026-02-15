import OpenAI from "openai";
import { z } from "zod";
import { zodResponseFormat } from "openai/helpers/zod";
import retry from "async-retry";
import type {
	ChatCompletionContentPart,
	ChatCompletionMessageParam,
	ParsedChatCompletion,
} from "openai/resources/chat/completions";
import { SYSTEM_PROMPT, USER_PROMPT } from "./prompts";
import type { ScoreResult } from "../types/classification";
import type {
	MultimodalAttachment,
	MultimodalClassifyPost,
	MultimodalImageAttachment,
} from "../types/multimodal";
import type { AppLogger } from "../lib/logger-types";
import {
	LLM_MAX_TOKENS,
	LLM_RETRY_ATTEMPTS,
	LLM_RETRY_MAX_TIMEOUT_MS,
	LLM_RETRY_MIN_TIMEOUT_MS,
	LLM_TEMPERATURE,
	MULTIMODAL_MAX_ATTACHMENTS,
	MULTIMODAL_MAX_PDF_EXCERPT_CHARS,
} from "../lib/policy-constants";

export type PostInput = MultimodalClassifyPost;

export interface LLMCallResult {
	scores: ScoreResult | null;
	source: "llm" | "error";
	model: string;
	latency: number;
	provider_http_status?: number;
	provider_error_code?: string;
	provider_error_type?: string;
	provider_error_message?: string;
}

export interface LlmRuntimeConfig {
	apiKey: string;
	textModel: string;
	vlmModel: string;
	baseUrl: string;
}

export interface LlmService {
	classifyPost: (post: PostInput) => Promise<LLMCallResult>;
}

export interface LlmServiceDeps {
	config: LlmRuntimeConfig;
	logger: Pick<AppLogger, "warn" | "error">;
}

const DecisionSchema = z.object({
	u: z.number(),
	d: z.number(),
	c: z.number(),
	rb: z.number(),
	eb: z.number(),
	sp: z.number(),
	p: z.number(),
	x: z.number(),
});

const PROMPT_MAX_ROOT_CHARS = 1600;
const PROMPT_MAX_REPOST_CHARS = 800;
const PROMPT_MAX_REPOST_COUNT = 5;
const PROMPT_MAX_ATTACHMENTS = MULTIMODAL_MAX_ATTACHMENTS;
const PROMPT_MAX_PDF_EXCERPT_CHARS = Math.min(
	800,
	MULTIMODAL_MAX_PDF_EXCERPT_CHARS,
);
const RESPONSE_SCHEMA_NAME = "classification";
const IMAGE_ATTACHMENT_KIND = "image";
const PDF_ATTACHMENT_KIND = "pdf";

function compactWhitespace(value: string): string {
	return value.replace(/\s+/g, " ").trim();
}

function truncate(value: string, maxChars: number): string {
	if (value.length <= maxChars) {
		return value;
	}
	return `${value.slice(0, Math.max(0, maxChars - 3))}...`;
}

function resolveRootText(post: PostInput): string {
	const rootNode = post.nodes.find((node) => node.kind === "root");
	const source = rootNode?.text ?? post.nodes[0]?.text ?? "";
	const cleaned = compactWhitespace(source);
	return cleaned.length > 0
		? truncate(cleaned, PROMPT_MAX_ROOT_CHARS)
		: "(empty)";
}

function resolveRepostLines(post: PostInput): string[] {
	const repostNodes = post.nodes.filter((node) => node.kind === "repost");
	if (repostNodes.length === 0) {
		return ["- (none)"];
	}

	return repostNodes
		.slice(0, PROMPT_MAX_REPOST_COUNT)
		.map(
			(node, index) =>
				`- [${index + 1}] ${truncate(compactWhitespace(node.text), PROMPT_MAX_REPOST_CHARS)}`,
		);
}

function isImageAttachment(
	attachment: MultimodalAttachment,
): attachment is MultimodalImageAttachment {
	return attachment.kind === IMAGE_ATTACHMENT_KIND;
}

function hasProviderAttachments(post: PostInput): boolean {
	return post.attachments.length > 0;
}

function resolveAttachmentLines(
	attachments: PostInput["attachments"],
): string[] {
	return attachments.slice(0, PROMPT_MAX_ATTACHMENTS).map((attachment) => {
		if (attachment.kind === IMAGE_ATTACHMENT_KIND) {
			return `- [image] node=${attachment.node_id} mime=${attachment.mime_type} sha256=${attachment.sha256}`;
		}

		const excerpt = compactWhitespace(attachment.excerpt_text ?? "");
		const excerptText =
			excerpt.length > 0
				? ` excerpt="${truncate(excerpt, PROMPT_MAX_PDF_EXCERPT_CHARS)}"`
				: "";
		return `- [${PDF_ATTACHMENT_KIND}] node=${attachment.node_id} source_url=${attachment.source_url}${excerptText}`;
	});
}

function formatSection(title: string, body: string): string {
	return `${title}:\n${body}`;
}

function buildPostContext(post: PostInput): string {
	const sections: string[] = [
		`Author: ${post.author_name}`,
		formatSection("ROOT POST", resolveRootText(post)),
		formatSection("REPOSTS", resolveRepostLines(post).join("\n")),
	];

	const attachmentLines = resolveAttachmentLines(post.attachments);
	if (attachmentLines.length > 0) {
		sections.push(formatSection("ATTACHMENTS", attachmentLines.join("\n")));
	}

	return sections.join("\n\n");
}

function resolveRequiredModel(
	modelName: string,
	envName: "LLM_MODEL" | "VLM_MODEL",
): string {
	const model = modelName.trim();
	if (!model) {
		throw new Error(`${envName} environment variable is required`);
	}
	return model;
}

export function selectModelForPayload(
	post: PostInput,
	config: LlmRuntimeConfig,
): string {
	return hasProviderAttachments(post)
		? resolveRequiredModel(config.vlmModel, "VLM_MODEL")
		: resolveRequiredModel(config.textModel, "LLM_MODEL");
}

export function constructUserPrompt(post: PostInput): string {
	return USER_PROMPT.replace("{{POST_TEXT}}", buildPostContext(post));
}

function toImageContentPart(
	attachment: MultimodalImageAttachment,
): ChatCompletionContentPart {
	return {
		type: "image_url",
		image_url: {
			url: `data:${attachment.mime_type};base64,${attachment.base64}`,
		},
	};
}

export function buildMessages(post: PostInput): ChatCompletionMessageParam[] {
	const imageParts = post.attachments
		.filter(isImageAttachment)
		.slice(0, PROMPT_MAX_ATTACHMENTS)
		.map(toImageContentPart);

	const userContent: ChatCompletionContentPart[] = [
		{ type: "text", text: constructUserPrompt(post) },
		...imageParts,
	];

	return [
		{ role: "system", content: SYSTEM_PROMPT },
		{ role: "user", content: userContent },
	];
}

function hasHttpStatus(error: unknown): error is { status: number } {
	if (typeof error !== "object" || error === null) {
		return false;
	}

	return typeof Reflect.get(error, "status") === "number";
}

type ProviderErrorMetadata = {
	provider_http_status?: number;
	provider_error_code?: string;
	provider_error_type?: string;
	provider_error_message?: string;
};

function extractProviderErrorMetadata(error: unknown): ProviderErrorMetadata {
	if (!(error instanceof Error)) {
		return {};
	}

	const metadata: ProviderErrorMetadata = {
		provider_error_message: error.message,
	};
	const status = Reflect.get(error, "status");
	const code = Reflect.get(error, "code");
	const type = Reflect.get(error, "type");

	if (typeof status === "number") {
		metadata.provider_http_status = status;
	}
	if (typeof code === "string") {
		metadata.provider_error_code = code;
	}
	if (typeof type === "string") {
		metadata.provider_error_type = type;
	}

	return metadata;
}

async function callLLMWithRetry(
	openai: OpenAI,
	model: string,
	messages: ChatCompletionMessageParam[],
	logger: Pick<AppLogger, "warn">,
): Promise<ParsedChatCompletion<ScoreResult>> {
	return retry(
		async (bail) => {
			try {
				const completion = await openai.chat.completions.parse({
					model,
					messages,
					temperature: LLM_TEMPERATURE,
					max_tokens: LLM_MAX_TOKENS,
					response_format: zodResponseFormat(
						DecisionSchema,
						RESPONSE_SCHEMA_NAME,
					),
				});

				const message = completion.choices[0]?.message;
				const parsed = message?.parsed;
				if (!message) {
					throw new Error("No completion choices returned");
				}

				if (message.refusal) {
					bail(new Error(`LLM refusal: ${message.refusal}`));
					return completion;
				}

				if (!parsed) {
					throw new Error("Empty response from LLM (content is null)");
				}

				return completion;
			} catch (error) {
				if (
					hasHttpStatus(error) &&
					(error.status === 401 || error.status === 403)
				) {
					bail(error);
					throw error;
				}
				throw error;
			}
		},
		{
			retries: LLM_RETRY_ATTEMPTS,
			minTimeout: LLM_RETRY_MIN_TIMEOUT_MS,
			maxTimeout: LLM_RETRY_MAX_TIMEOUT_MS,
			randomize: true,
			onRetry: (error, attempt) => {
				logger.warn("llm_retry", {
					attempt,
					error: error instanceof Error ? error.message : String(error),
				});
			},
		},
	);
}

export async function callModel(
	openai: OpenAI,
	config: LlmRuntimeConfig,
	post: PostInput,
	logger: Pick<AppLogger, "warn">,
): Promise<ParsedChatCompletion<ScoreResult>> {
	return callLLMWithRetry(
		openai,
		selectModelForPayload(post, config),
		buildMessages(post),
		logger,
	);
}

export function parseAndValidateResponse(content: string | null): ScoreResult {
	if (!content) {
		throw new Error("Empty content received from LLM");
	}

	const parsed = JSON.parse(content);
	return DecisionSchema.parse(parsed);
}

export function createLlmService(deps: LlmServiceDeps): LlmService {
	const { config, logger } = deps;

	async function classifyPost(post: PostInput): Promise<LLMCallResult> {
		const startTime = Date.now();

		if (!config.apiKey || config.apiKey.startsWith("sk-or-dummy")) {
			logger.warn("llm_dev_fallback", { reason: "missing_or_dummy_api_key" });
			return {
				scores: null,
				source: "error",
				model: "dev-fallback",
				latency: 0,
			};
		}

		const selectedModel = selectModelForPayload(post, config);

		const openai = new OpenAI({
			apiKey: config.apiKey,
			baseURL: config.baseUrl,
		});

		try {
			const parsedCompletion = await callModel(openai, config, post, logger);
			const scores = parsedCompletion.choices[0]?.message.parsed;
			// const scores = parseAndValidateResponse(completion.choices[0]?.message.content ?? null);

			return {
				scores,
				source: "llm",
				model: selectedModel,
				latency: Date.now() - startTime,
			};
		} catch (error) {
			logger.error("llm_classification_failed", error, {
				model: selectedModel,
			});
			const providerMetadata = extractProviderErrorMetadata(error);
			return {
				scores: null,
				source: "error",
				model: selectedModel,
				latency: Date.now() - startTime,
				...providerMetadata,
			};
		}
	}

	return {
		classifyPost,
	};
}
