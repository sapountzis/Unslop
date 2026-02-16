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
	MULTIMODAL_MAX_NODE_COUNT,
	MULTIMODAL_MAX_NODE_DEPTH,
	MULTIMODAL_MAX_PDF_EXCERPT_CHARS,
} from "../lib/policy-constants";
import type { MultimodalPostNode } from "../types/multimodal";
export interface ClassifyRoutesDeps {
	authMiddleware: MiddlewareHandler;
	classificationService: ClassificationService;
}

const BASE64_PATTERN =
	/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const SHA256_HEX_PATTERN = /^[a-f0-9]{64}$/i;

type NodeValidationIssue = {
	message: string;
	path: (string | number)[];
};

function decodedBase64ByteLength(value: string): number {
	return Buffer.from(value, "base64").byteLength;
}

function maxBase64Length(maxBytes: number): number {
	return Math.ceil(maxBytes / 3) * 4;
}

function validateNodeGraph(nodes: MultimodalPostNode[]): NodeValidationIssue[] {
	const issues: NodeValidationIssue[] = [];
	const nodeById = new Map<string, MultimodalPostNode>();

	nodes.forEach((node, index) => {
		if (nodeById.has(node.id)) {
			issues.push({
				message: "nodes.id must be unique",
				path: [index, "id"],
			});
			return;
		}

		nodeById.set(node.id, node);

		if (node.kind === "root" && node.parent_id !== null) {
			issues.push({
				message: "root node parent_id must be null",
				path: [index, "parent_id"],
			});
		}

		if (node.kind === "repost" && node.parent_id === null) {
			issues.push({
				message: "repost node parent_id is required",
				path: [index, "parent_id"],
			});
		}
	});

	const rootNodes = nodes.filter((node) => node.kind === "root");
	if (rootNodes.length !== 1) {
		issues.push({
			message: "nodes must include exactly one root node",
			path: [],
		});
	}

	const memo = new Map<string, number>();
	const computeDepth = (
		nodeId: string,
		visiting: Set<string>,
	): number | null => {
		const cached = memo.get(nodeId);
		if (cached !== undefined) {
			return cached;
		}

		if (visiting.has(nodeId)) {
			return null;
		}

		const node = nodeById.get(nodeId);
		if (!node) {
			return null;
		}

		visiting.add(nodeId);

		if (node.parent_id === null) {
			memo.set(nodeId, 0);
			visiting.delete(nodeId);
			return 0;
		}

		const parentDepth = computeDepth(node.parent_id, visiting);
		if (parentDepth === null) {
			visiting.delete(nodeId);
			return null;
		}

		const depth = parentDepth + 1;
		memo.set(nodeId, depth);
		visiting.delete(nodeId);
		return depth;
	};

	nodes.forEach((node, index) => {
		if (node.parent_id !== null && !nodeById.has(node.parent_id)) {
			issues.push({
				message: "node parent_id must reference an existing node id",
				path: [index, "parent_id"],
			});
		}

		const depth = computeDepth(node.id, new Set());
		if (depth === null) {
			issues.push({
				message: "nodes graph must be acyclic and connected to root",
				path: [index],
			});
			return;
		}

		if (depth > MULTIMODAL_MAX_NODE_DEPTH) {
			issues.push({
				message: `nodes depth must be <= ${MULTIMODAL_MAX_NODE_DEPTH}`,
				path: [index],
			});
		}
	});

	return issues;
}

function isQuotaExceededError(error: unknown): boolean {
	return (
		error instanceof QuotaExceededError ||
		(error instanceof Error &&
			(error.message === "quota_exceeded" ||
				error.name === "QuotaExceededError"))
	);
}

const classifyNodeSchema = z
	.object({
		id: z.string().min(1),
		parent_id: z.string().min(1).nullable(),
		kind: z.enum(["root", "repost"]),
		text: z.string().max(CONTENT_TEXT_MAX_CHARS),
	})
	.strict();

const classifyImageAttachmentSchema = z
	.object({
		node_id: z.string().min(1),
		kind: z.literal("image"),
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
		node_id: z.string().min(1),
		kind: z.literal("pdf"),
		source_url: z.string().url(),
		excerpt_text: z.string().max(MULTIMODAL_MAX_PDF_EXCERPT_CHARS).optional(),
	})
	.strict();

const classifyAttachmentSchema = z.discriminatedUnion("kind", [
	classifyImageAttachmentSchema,
	classifyPdfAttachmentSchema,
]);

const classifyNodesSchema = z
	.array(classifyNodeSchema)
	.min(1)
	.max(MULTIMODAL_MAX_NODE_COUNT)
	.superRefine((nodes, ctx) => {
		for (const issue of validateNodeGraph(nodes as MultimodalPostNode[])) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: issue.message,
				path: issue.path,
			});
		}
	});

export const classifyPostSchema = z
	.object({
		post_id: z.string().min(1),
		author_id: z.string().min(1),
		author_name: z.string().min(1),
		nodes: classifyNodesSchema,
		attachments: z
			.array(classifyAttachmentSchema)
			.max(MULTIMODAL_MAX_ATTACHMENTS),
	})
	.strict()
	.superRefine((post, ctx) => {
		const nodeIds = new Set(post.nodes.map((node) => node.id));

		post.attachments.forEach((attachment, index) => {
			if (!nodeIds.has(attachment.node_id)) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: "attachment node_id must reference an existing node id",
					path: ["attachments", index, "node_id"],
				});
			}
		});
	});

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
			if (!(await deps.classificationService.hasAvailableQuota(user.sub))) {
				return c.json({ error: "quota_exceeded" }, 429);
			}
			const encoder = new TextEncoder();
			const unresolvedPostIds = new Set(payload.posts.map((post) => post.post_id));

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
