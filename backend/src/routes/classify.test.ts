import { beforeEach, describe, expect, it, mock } from "bun:test";
import { createTestApp } from "../test-utils/app";
import {
	normalizeContentText,
	hashContentText,
	derivePostId,
} from "../lib/hash";
import {
	CLASSIFY_BATCH_MAX_SIZE,
	MULTIMODAL_MAX_ATTACHMENTS,
	MULTIMODAL_MAX_IMAGE_BYTES,
	MULTIMODAL_MAX_NODE_COUNT,
	MULTIMODAL_MAX_NODE_DEPTH,
	MULTIMODAL_MAX_PDF_EXCERPT_CHARS,
} from "../lib/policy-constants";
import type { ClassificationService } from "../services/classification-service";

process.env.TEST_MODE = process.env.TEST_MODE || "true";
process.env.DATABASE_URL =
	process.env.DATABASE_URL ||
	"postgres://postgres:postgres@localhost:5432/unslop_test";
process.env.APP_URL = process.env.APP_URL || "http://localhost:3000";
process.env.MAGIC_LINK_BASE_URL =
	process.env.MAGIC_LINK_BASE_URL || "http://localhost:3000";
process.env.VLM_MODEL = process.env.VLM_MODEL || "test-vlm";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-key";

const { generateSessionToken, verifySessionToken } = await import("../lib/jwt");
const { ScoringEngine } = await import("../services/scoring");
const { batchClassifySchema, classifySchema, createClassifyRoutes } =
	await import("./classify");
const { createAuthMiddleware } = await import("../middleware/auth");
type ClassifyBatchStreamFn = ClassificationService["classifyBatchStream"];

class TestQuotaExceededError extends Error {
	constructor() {
		super("quota_exceeded");
		this.name = "QuotaExceededError";
	}
}

const classifySingleMock = mock(async () => ({
	post_id: "post-1",
	decision: "keep" as const,
	source: "llm" as const,
}));

const classifyBatchStreamMock = mock((async (_userId, _posts, onOutcome) => {
	await onOutcome({
		post_id: "post-1",
		decision: "hide" as const,
		source: "cache" as const,
	});
	await onOutcome({ post_id: "post-2", error: "quota_exceeded" as const });
}) as ClassifyBatchStreamFn);

const authMiddleware = createAuthMiddleware({ verifySessionToken });

const app = createTestApp((testApp) => {
	testApp.route(
		"/",
		createClassifyRoutes({
			authMiddleware,
			classificationService: {
				classifySingle: classifySingleMock,
				classifyBatchStream: classifyBatchStreamMock,
			},
		}),
	);
});

function createMultimodalPost(overrides?: Partial<Record<string, unknown>>) {
	return {
		post_id: "post-1",
		author_id: "author-1",
		author_name: "Author 1",
		nodes: [{ id: "root", parent_id: null, kind: "root", text: "Root text" }],
		attachments: [],
		...overrides,
	};
}

function createNodeChain(depth: number) {
	return Array.from({ length: depth + 1 }, (_, index) => ({
		id: index === 0 ? "root" : `node-${index}`,
		parent_id: index === 0 ? null : index === 1 ? "root" : `node-${index - 1}`,
		kind: index === 0 ? "root" : "repost",
		text: `Node ${index}`,
	}));
}

function createAttachment(kind: "image" | "pdf", ordinal: number) {
	if (kind === "image") {
		return {
			node_id: "root",
			kind: "image",
			sha256: "a".repeat(64),
			mime_type: "image/jpeg",
			base64: "YQ==",
		};
	}

	return {
		node_id: "root",
		kind: "pdf",
		source_url: `https://example.com/file-${ordinal}.pdf`,
		excerpt_text: "Excerpt",
	};
}

describe("Classify Routes (unit)", () => {
	const TEST_USER_ID = "00000000-0000-0000-0000-000000000001";

	beforeEach(() => {
		classifySingleMock.mockClear();
		classifyBatchStreamMock.mockClear();
	});

	it("POST /v1/classify rejects unauthenticated requests", async () => {
		const res = await app.request("http://localhost/v1/classify", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				post: {
					post_id: "x",
					author_id: "x",
					author_name: "x",
					nodes: [{ id: "root", parent_id: null, kind: "root", text: "x" }],
					attachments: [],
				},
			}),
		});

		expect(res.status).toBe(401);
	});

	it("POST /v1/classify rejects invalid payload", async () => {
		const token = await generateSessionToken(TEST_USER_ID, "test@example.com");

		const res = await app.request("http://localhost/v1/classify", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${token}`,
			},
			body: JSON.stringify({ invalid: "payload" }),
		});

		expect(res.status).toBe(400);
	});

	it("POST /v1/classify delegates classification to service", async () => {
		const token = await generateSessionToken(TEST_USER_ID, "test@example.com");
		const payload = {
			post: createMultimodalPost({
				post_id: "svc-1",
				author_id: "author-1",
				author_name: "Test Author",
			}),
		};

		const res = await app.request("http://localhost/v1/classify", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${token}`,
			},
			body: JSON.stringify(payload),
		});

		expect(res.status).toBe(200);
		expect(classifySingleMock).toHaveBeenCalledTimes(1);
		expect(classifySingleMock).toHaveBeenCalledWith(TEST_USER_ID, payload.post);
	});

	it("POST /v1/classify maps quota domain error to 429", async () => {
		classifySingleMock.mockRejectedValueOnce(new TestQuotaExceededError());
		const token = await generateSessionToken(TEST_USER_ID, "test@example.com");

		const res = await app.request("http://localhost/v1/classify", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${token}`,
			},
			body: JSON.stringify({
				post: createMultimodalPost({
					post_id: "quota-1",
					author_id: "author-1",
					author_name: "Test Author",
				}),
			}),
		});

		expect(res.status).toBe(429);
		expect(await res.json()).toEqual({ error: "quota_exceeded" });
	});

	it("POST /v1/classify/batch rejects unauthenticated batch requests", async () => {
		const res = await app.request("http://localhost/v1/classify/batch", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ posts: [] }),
		});

		expect(res.status).toBe(401);
	});

	it("POST /v1/classify/batch rejects invalid batch payload", async () => {
		const token = await generateSessionToken(TEST_USER_ID, "test@example.com");

		const res = await app.request("http://localhost/v1/classify/batch", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${token}`,
			},
			body: JSON.stringify({ invalid: "payload" }),
		});

		expect(res.status).toBe(400);
	});

	it("POST /v1/classify/batch enforces max batch size", async () => {
		const token = await generateSessionToken(TEST_USER_ID, "test@example.com");
		const posts = Array.from({ length: 21 }, (_, index) => ({
			...createMultimodalPost(),
			post_id: `batch-max-${index}`,
			author_id: "author-123",
			author_name: "Batch Test",
			nodes: [
				{
					id: "root",
					parent_id: null,
					kind: "root",
					text: "Short test content.",
				},
			],
		}));

		const res = await app.request("http://localhost/v1/classify/batch", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${token}`,
			},
			body: JSON.stringify({ posts }),
		});

		expect(res.status).toBe(400);
	});

	it("POST /v1/classify/batch streams service outcomes as ndjson", async () => {
		const token = await generateSessionToken(TEST_USER_ID, "test@example.com");
		const payload = {
			posts: [
				{
					...createMultimodalPost(),
					post_id: "post-1",
					author_id: "author-1",
					author_name: "A",
					nodes: [{ id: "root", parent_id: null, kind: "root", text: "one" }],
				},
				{
					...createMultimodalPost(),
					post_id: "post-2",
					author_id: "author-2",
					author_name: "B",
					nodes: [{ id: "root", parent_id: null, kind: "root", text: "two" }],
				},
			],
		};

		const res = await app.request("http://localhost/v1/classify/batch", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${token}`,
			},
			body: JSON.stringify(payload),
		});

		expect(res.status).toBe(200);
		expect(res.headers.get("Content-Type")).toContain("application/x-ndjson");
		expect(classifyBatchStreamMock).toHaveBeenCalledTimes(1);
		expect(classifyBatchStreamMock).toHaveBeenCalledWith(
			TEST_USER_ID,
			payload.posts,
			expect.any(Function),
		);

		const lines = (await res.text())
			.trim()
			.split("\n")
			.map((line) => JSON.parse(line));

		expect(lines).toEqual([
			{ post_id: "post-1", decision: "hide", source: "cache" },
			{ post_id: "post-2", error: "quota_exceeded" },
		]);
	});

	it("POST /v1/classify/batch fail-opens unresolved posts when stream crashes", async () => {
		classifyBatchStreamMock.mockImplementationOnce(
			async (_userId, _posts, onOutcome) => {
				await onOutcome({
					post_id: "post-1",
					decision: "hide",
					source: "cache",
				});
				throw new Error("stream crash");
			},
		);

		const token = await generateSessionToken(TEST_USER_ID, "test@example.com");
		const payload = {
			posts: [
				{
					...createMultimodalPost(),
					post_id: "post-1",
					author_id: "author-1",
					author_name: "A",
					nodes: [{ id: "root", parent_id: null, kind: "root", text: "one" }],
				},
				{
					...createMultimodalPost(),
					post_id: "post-2",
					author_id: "author-2",
					author_name: "B",
					nodes: [{ id: "root", parent_id: null, kind: "root", text: "two" }],
				},
			],
		};

		const res = await app.request("http://localhost/v1/classify/batch", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${token}`,
			},
			body: JSON.stringify(payload),
		});

		expect(res.status).toBe(200);
		const lines = (await res.text())
			.trim()
			.split("\n")
			.map((line) => JSON.parse(line));

		expect(lines).toEqual([
			{ post_id: "post-1", decision: "hide", source: "cache" },
			{ post_id: "post-2", decision: "keep", source: "error" },
		]);
	});

	it("validators use shared policy constants", () => {
		const legacyFieldName = `content${"_text"}`;
		const multimodalPost = {
			post_id: "p1",
			author_id: "a1",
			author_name: "n1",
			nodes: [{ id: "root", parent_id: null, kind: "root", text: "x" }],
			attachments: [],
		};

		expect(
			classifySchema.safeParse({
				post: multimodalPost,
			}).success,
		).toBe(true);

		expect(
			classifySchema.safeParse({
				post: {
					post_id: "legacy-p1",
					author_id: "a1",
					author_name: "n1",
					[legacyFieldName]: "legacy",
				},
			}).success,
		).toBe(false);

		expect(
			batchClassifySchema.safeParse({
				posts: Array.from({ length: CLASSIFY_BATCH_MAX_SIZE }, (_, index) => ({
					post_id: `p-${index}`,
					author_id: "a1",
					author_name: "n1",
					nodes: [{ id: "root", parent_id: null, kind: "root", text: "x" }],
					attachments: [],
				})),
			}).success,
		).toBe(true);

		expect(
			batchClassifySchema.safeParse({
				posts: Array.from(
					{ length: CLASSIFY_BATCH_MAX_SIZE + 1 },
					(_, index) => ({
						post_id: `p-${index}`,
						author_id: "a1",
						author_name: "n1",
						nodes: [{ id: "root", parent_id: null, kind: "root", text: "x" }],
						attachments: [],
					}),
				),
			}).success,
		).toBe(false);
	});

	it("rejects multimodal payloads that exceed policy limits and rejects legacy shape", () => {
		const legacyFieldName = `content${"_text"}`;
		const maxEncodedLength = Math.ceil(MULTIMODAL_MAX_IMAGE_BYTES / 3) * 4;
		const tooManyNodes = createMultimodalPost({
			nodes: Array.from(
				{ length: MULTIMODAL_MAX_NODE_COUNT + 1 },
				(_, index) => ({
					id: index === 0 ? "root" : `node-${index}`,
					parent_id: index === 0 ? null : "root",
					kind: index === 0 ? "root" : "repost",
					text: `Node ${index}`,
				}),
			),
		});
		const tooDeepNodes = createMultimodalPost({
			nodes: createNodeChain(MULTIMODAL_MAX_NODE_DEPTH + 1),
		});
		const tooManyAttachments = createMultimodalPost({
			attachments: Array.from(
				{ length: MULTIMODAL_MAX_ATTACHMENTS + 1 },
				(_, index) => createAttachment("image", index),
			),
		});
		const tooLargeImage = createMultimodalPost({
			attachments: [
				{
					node_id: "root",
					kind: "image",
					sha256: "b".repeat(64),
					mime_type: "image/jpeg",
					base64: Buffer.alloc(MULTIMODAL_MAX_IMAGE_BYTES + 1).toString(
						"base64",
					),
				},
			],
		});
		const tooLongEncodedImage = createMultimodalPost({
			attachments: [
				{
					node_id: "root",
					kind: "image",
					sha256: "c".repeat(64),
					mime_type: "image/jpeg",
					base64: "A".repeat(maxEncodedLength + 4),
				},
			],
		});
		const tooLongPdfExcerpt = createMultimodalPost({
			attachments: [
				{
					node_id: "root",
					kind: "pdf",
					source_url: "https://example.com/file.pdf",
					excerpt_text: "x".repeat(MULTIMODAL_MAX_PDF_EXCERPT_CHARS + 1),
				},
			],
		});
		const unknownFieldShape = {
			post: {
				...createMultimodalPost(),
				extra_field: "unexpected",
			},
		};
		const legacyShape = {
			post: {
				post_id: "legacy-1",
				author_id: "author-1",
				author_name: "Author 1",
				[legacyFieldName]: "legacy",
			},
		};

		expect(
			classifySchema.safeParse({ post: createMultimodalPost() }).success,
		).toBe(true);
		expect(classifySchema.safeParse({ post: tooManyNodes }).success).toBe(
			false,
		);
		expect(classifySchema.safeParse({ post: tooDeepNodes }).success).toBe(
			false,
		);
		expect(classifySchema.safeParse({ post: tooManyAttachments }).success).toBe(
			false,
		);
		expect(classifySchema.safeParse({ post: tooLargeImage }).success).toBe(
			false,
		);
		const tooLongEncodedResult = classifySchema.safeParse({
			post: tooLongEncodedImage,
		});
		expect(tooLongEncodedResult.success).toBe(false);
		expect(
			tooLongEncodedResult.error?.issues.map((issue) => issue.message),
		).toContain(
			`image attachment base64 length must be <= ${maxEncodedLength}`,
		);
		expect(classifySchema.safeParse({ post: tooLongPdfExcerpt }).success).toBe(
			false,
		);
		expect(classifySchema.safeParse(unknownFieldShape).success).toBe(false);
		expect(classifySchema.safeParse(legacyShape).success).toBe(false);
	});
});

describe("Scoring Engine", () => {
	const uniform = (value: number, slop: number) => ({
		u: value,
		d: value,
		c: value,
		rb: slop,
		eb: slop,
		sp: slop,
		p: slop,
		x: slop,
	});

	it("scores keep for strong value and weak slop", () => {
		const engine = new ScoringEngine();
		// rb=0.3 is below safety gate (0.5), so rescue can fire; u=0.7 >= RESCUE_U (0.6)
		const result = engine.score(uniform(0.7, 0.3));

		expect(result.decision).toBe("keep");
	});

	it("applies toxic veto before hide rules", () => {
		const engine = new ScoringEngine();
		// rb=0.7 hard veto → hide
		const atLowerBound = engine.score(uniform(0.5, 0.7));
		// rb=0.4 below all thresholds, no rescue → keep neutral
		const middle = engine.score(uniform(0.4, 0.4));
		// rb=0.45 below safety gate (0.5), u=0.69 >= RESCUE_U (0.6) → keep rescued
		const nearUpperBound = engine.score(uniform(0.69, 0.45));

		expect(atLowerBound.decision).toBe("hide");
		expect(middle.decision).toBe("keep");
		expect(nearUpperBound.decision).toBe("keep");
	});

	it("scores hide for weak value and strong slop", () => {
		const engine = new ScoringEngine();
		const result = engine.score(uniform(0.49, 0.71));

		expect(result.decision).toBe("hide");
	});

	it("regression: neutral low-signal input remains keep", () => {
		const engine = new ScoringEngine();
		const result = engine.score(uniform(0.4, 0.4));

		expect(result.decision).toBe("keep");
	});
});

describe("Hash Utilities", () => {
	it("normalizes content text", () => {
		const input = "  EXCESSIVE   WHITESPACE\n\nand  CAPS  ";
		const normalized = normalizeContentText(input);
		expect(normalized).toBe("excessive whitespace and caps");
	});

	it("truncates content to 4000 characters", () => {
		const longInput = "a".repeat(5000);
		const normalized = normalizeContentText(longInput);
		expect(normalized.length).toBe(4000);
	});

	it("generates consistent hash for same content", () => {
		const content = "test content";
		const hash1 = hashContentText(content);
		const hash2 = hashContentText(content);

		expect(hash1).toBe(hash2);
		expect(hash1).toMatch(/^[a-f0-9]{64}$/);
	});

	it("derives post ID from author and content", () => {
		const postId = derivePostId("author-123", "test content");
		const postId2 = derivePostId("author-123", "test content");
		const postId3 = derivePostId("author-123", "different content");

		expect(postId).toMatch(/^[a-f0-9]{64}$/);
		expect(postId).toBe(postId2);
		expect(postId).not.toBe(postId3);
	});
});

describe("JWT Utilities", () => {
	it("generates and verifies session token", async () => {
		const token = await generateSessionToken("user-123", "test@example.com");
		const payload = await verifySessionToken(token);

		expect(typeof token).toBe("string");
		expect(payload.sub).toBe("user-123");
		expect(payload.email).toBe("test@example.com");
	});

	it("rejects invalid token", async () => {
		await expect(verifySessionToken("invalid-token")).rejects.toThrow();
	});
});
