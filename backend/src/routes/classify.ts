import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { MiddlewareHandler } from "hono";
import type {
	BatchClassificationResponse,
	ClassificationService,
} from "../services/classification-service";
import { QuotaExceededError } from "../services/classification-service";
import {
	CLASSIFY_BATCH_MAX_SIZE,
	CONTENT_TEXT_MAX_CHARS,
	MULTIMODAL_MAX_ATTACHMENTS,
	MULTIMODAL_MAX_IMAGE_BYTES,
	MULTIMODAL_MAX_PDF_EXCERPT_CHARS,
} from "../lib/policy-constants";

export interface ClassifyRoutesDeps {
	authMiddleware: MiddlewareHandler;
	classificationService: ClassificationService;
}

const BASE64_PATTERN =
	/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const SHA256_HEX_PATTERN = /^[a-f0-9]{64}$/i;

function decodedBase64ByteLength(value: string): number {
	return Buffer.from(value, "base64").byteLength;
}

function maxBase64Length(maxBytes: number): number {
	return Math.ceil(maxBytes / 3) * 4;
}

function isQuotaExceededError(error: unknown): boolean {
	return (
		error instanceof QuotaExceededError ||
		(error instanceof Error &&
			(error.message === "quota_exceeded" ||
				error.name === "QuotaExceededError"))
	);
}

const classifyImageAttachmentSchema = z
	.object({
		kind: z.literal("image"),
		ordinal: z.number().int().min(0).optional(),
		sha256: z.string().regex(SHA256_HEX_PATTERN),
		mime_type: z.string().min(1),
		base64: z
			.string()
			.regex(BASE64_PATTERN)
			.superRefine((value, ctx) => {
				if (value.length > maxBase64Length(MULTIMODAL_MAX_IMAGE_BYTES)) {
					ctx.addIssue({
						code: z.ZodIssueCode.custom,
						message: `image attachment base64 length must be <= ${maxBase64Length(MULTIMODAL_MAX_IMAGE_BYTES)}`,
					});
					return;
				}

				if (decodedBase64ByteLength(value) > MULTIMODAL_MAX_IMAGE_BYTES) {
					ctx.addIssue({
						code: z.ZodIssueCode.custom,
						message: `image attachment bytes must be <= ${MULTIMODAL_MAX_IMAGE_BYTES} after base64 decoding`,
					});
				}
			}),
	})
	.strict();

const classifyPdfAttachmentSchema = z
	.object({
		kind: z.literal("pdf"),
		ordinal: z.number().int().min(0).optional(),
		source_url: z.string().url(),
		excerpt_text: z.string().max(MULTIMODAL_MAX_PDF_EXCERPT_CHARS).optional(),
	})
	.strict();

const classifyAttachmentSchema = z.discriminatedUnion("kind", [
	classifyImageAttachmentSchema,
	classifyPdfAttachmentSchema,
]);

export const classifyPostSchema = z
	.object({
		post_id: z.string().min(1),
		text: z.string().max(CONTENT_TEXT_MAX_CHARS),
		attachments: z
			.array(classifyAttachmentSchema)
			.max(MULTIMODAL_MAX_ATTACHMENTS),
	})
	.strict();

export const classifySchema = z
	.object({
		post: classifyPostSchema,
	})
	.strict();

export const batchClassifySchema = z
	.object({
		posts: z.array(classifyPostSchema).min(1).max(CLASSIFY_BATCH_MAX_SIZE),
	})
	.strict();

export function createClassifyRoutes(deps: ClassifyRoutesDeps): Hono {
	const classify = new Hono();
	type ClassifySinglePayload = z.infer<typeof classifySchema>;
	type ClassifyBatchPayload = z.infer<typeof batchClassifySchema>;

	classify.post(
		"/v1/classify",
		deps.authMiddleware,
		zValidator("json", classifySchema),
		async (c) => {
			const user = c.get("user");
			const payload: ClassifySinglePayload = c.req.valid("json");

			try {
				const result = await deps.classificationService.classifySingle(
					user.sub,
					payload.post,
				);
				return c.json(result);
			} catch (error) {
				if (isQuotaExceededError(error)) {
					return c.json({ error: "quota_exceeded" }, 429);
				}
				throw error;
			}
		},
	);

	classify.post(
		"/v1/classify/batch",
		deps.authMiddleware,
		zValidator("json", batchClassifySchema),
		async (c) => {
			const user = c.get("user");
			const payload: ClassifyBatchPayload = c.req.valid("json");
			const encoder = new TextEncoder();
			const unresolvedPostIds = new Set(
				payload.posts.map((post) => post.post_id),
			);

			const stream = new ReadableStream({
				async start(controller) {
					try {
						await deps.classificationService.classifyBatchStream(
							user.sub,
							payload.posts,
							(outcome) => {
								unresolvedPostIds.delete(outcome.post_id);
								controller.enqueue(
									encoder.encode(`${JSON.stringify(outcome)}\n`),
								);
							},
						);
					} catch (_error) {
						for (const postId of unresolvedPostIds) {
							const fallback: BatchClassificationResponse = {
								post_id: postId,
								decision: "keep",
								source: "error",
							};
							controller.enqueue(
								encoder.encode(`${JSON.stringify(fallback)}\n`),
							);
						}
					} finally {
						controller.close();
					}
				},
			});

			return c.body(stream, 200, {
				"Content-Type": "application/x-ndjson; charset=utf-8",
				"Cache-Control": "no-store",
			});
		},
	);

	return classify;
}
