import { describe, expect, it } from "bun:test";
import { generateSessionToken } from "../lib/jwt";

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-key";

const API_URL = process.env.APP_URL || "http://localhost:3000";

async function isServerRunning(): Promise<boolean> {
	try {
		await fetch(`${API_URL}/health`, { signal: AbortSignal.timeout(500) });
		return true;
	} catch {
		return false;
	}
}

async function skipIfNoServer(): Promise<boolean> {
	if (!(await isServerRunning())) {
		console.log(
			"Skipping classify e2e test: API server is not running at APP_URL.",
		);
		return true;
	}
	return false;
}

describe("Classify Endpoint E2E", () => {
	const TEST_USER_ID = "00000000-0000-0000-0000-000000000001";

	it("classifies via API with auth", async () => {
		if (await skipIfNoServer()) return;

		const token = await generateSessionToken(TEST_USER_ID, "test@example.com");

		const res = await fetch(`${API_URL}/v1/classify`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${token}`,
			},
			body: JSON.stringify({
				post: {
					post_id: "e2e-test-post-1",
					author_id: "author-123",
					author_name: "E2E Test",
					nodes: [
						{
							id: "root",
							parent_id: null,
							kind: "root",
							text: "This is a genuine helpful post about programming best practices.",
						},
					],
					attachments: [],
				},
			}),
		});

		if (res.status === 429) {
			console.log("Skipping strict assertion: quota exceeded for test user.");
			return;
		}

		expect(res.status).toBe(200);
		const data = (await res.json()) as {
			post_id: string;
			decision: string;
			source: string;
		};
		expect(data.post_id).toBe("e2e-test-post-1");
		expect(["keep", "hide"]).toContain(data.decision);
	}, 30000);

	it("rejects unauthenticated requests", async () => {
		if (await skipIfNoServer()) return;

		const res = await fetch(`${API_URL}/v1/classify`, {
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
});

describe("Batch Classify Endpoint E2E", () => {
	const TEST_USER_ID = "00000000-0000-0000-0000-000000000001";

	it("rejects unauthenticated batch requests", async () => {
		if (await skipIfNoServer()) return;

		const res = await fetch(`${API_URL}/v1/classify/batch`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ posts: [] }),
		});

		expect(res.status).toBe(401);
	});

	it("rejects invalid batch payload", async () => {
		if (await skipIfNoServer()) return;

		const token = await generateSessionToken(TEST_USER_ID, "test@example.com");

		const res = await fetch(`${API_URL}/v1/classify/batch`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${token}`,
			},
			body: JSON.stringify({ invalid: "payload" }),
		});

		expect(res.status).toBe(400);
	});

	it("enforces max batch size", async () => {
		if (await skipIfNoServer()) return;

		const token = await generateSessionToken(TEST_USER_ID, "test@example.com");
		const posts = Array.from({ length: 21 }, (_, index) => ({
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
			attachments: [],
		}));

		const res = await fetch(`${API_URL}/v1/classify/batch`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${token}`,
			},
			body: JSON.stringify({ posts }),
		});

		expect(res.status).toBe(400);
	});
});
