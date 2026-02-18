import {
	describe,
	expect,
	it,
	mock,
	beforeEach,
	afterEach,
	jest,
} from "bun:test";
import type { PostData } from "../types";

// Yield to microtasks — works while fake timers are active.
async function drain(): Promise<void> {
	await Promise.resolve();
	await Promise.resolve();
	await Promise.resolve();
}

// ── Mock storage ───────────────────────────────────────────────────────────
// Must be set up before Classifier is imported so the module-level singleton
// picks up the mock.

const cacheGetMock = mock(
	async (_id: string) =>
		null as null | {
			decision: "keep" | "hide";
			source: "llm" | "cache" | "error";
			timestamp: number;
		},
);
const cacheSetMock = mock(async (..._args: unknown[]) => {});

mock.module("../lib/storage", () => ({
	decisionCache: { get: cacheGetMock, set: cacheSetMock },
}));

const { Classifier } = await import("./classifier");
import {
	BATCH_MAX_ITEMS,
	BATCH_WINDOW_MS,
	FETCH_TIMEOUT_MS,
	BATCH_RESULT_TIMEOUT_MS,
} from "../lib/config";

function makePost(id: string): PostData {
	return { post_id: id, text: `text for ${id}`, attachments: [] };
}

function makeSendOk() {
	return mock(async (_msg: { type: string; posts: PostData[] }) => ({
		status: "ok" as const,
	}));
}

beforeEach(() => {
	jest.useFakeTimers();
	cacheGetMock.mockReset();
	cacheGetMock.mockResolvedValue(null);
	cacheSetMock.mockReset();
});

afterEach(() => {
	jest.useRealTimers();
});

// ── Classifier.classify ────────────────────────────────────────────────────

describe("Classifier.classify", () => {
	it("queues post and flushes after timer fires → sendMessage called with correct payload", async () => {
		const sendMessage = makeSendOk();
		const classifier = new Classifier(sendMessage);

		const post = makePost("p1");
		const promise = classifier.classify(post);

		await drain(); // let classify resume past decisionCache.get, set up pending + timers

		jest.advanceTimersByTime(BATCH_WINDOW_MS); // fire the flush timer (75ms)
		await drain(); // let async flush run

		expect(sendMessage).toHaveBeenCalledTimes(1);
		const [msg] = sendMessage.mock.calls[0] as [
			{ type: string; posts: PostData[] },
		];
		expect(msg.posts).toContainEqual(post);

		classifier.onBatchResult({
			post_id: "p1",
			decision: "keep",
			source: "llm",
		});
		await promise;
	});

	it("BATCH_MAX_ITEMS posts triggers immediate flush (no timer needed)", async () => {
		const sendMessage = makeSendOk();
		const classifier = new Classifier(sendMessage);

		const promises: Promise<unknown>[] = [];
		for (let i = 0; i < BATCH_MAX_ITEMS; i++) {
			promises.push(classifier.classify(makePost(`p${i}`)));
		}
		await drain(); // let all classifies settle + flush triggered by 20th item

		expect(sendMessage).toHaveBeenCalledTimes(1);

		// Resolve all pending entries
		for (let i = 0; i < BATCH_MAX_ITEMS; i++) {
			classifier.onBatchResult({
				post_id: `p${i}`,
				decision: "keep",
				source: "llm",
			});
		}
		await Promise.all(promises);
	});

	it("same post_id twice: deduplication — one queue entry, both promises resolve together", async () => {
		const sendMessage = makeSendOk();
		const classifier = new Classifier(sendMessage);

		const post = makePost("dup");
		const p1 = classifier.classify(post);
		const p2 = classifier.classify(post);

		await drain(); // set up pending entries (first one wins, second reuses)

		jest.advanceTimersByTime(BATCH_WINDOW_MS); // flush timer
		await drain();

		classifier.onBatchResult({
			post_id: "dup",
			decision: "hide",
			source: "llm",
		});

		const [r1, r2] = await Promise.all([p1, p2]);
		expect(r1).toEqual({ decision: "hide", source: "llm" });
		expect(r2).toEqual({ decision: "hide", source: "llm" });
	});

	it("cache hit (non-error source): resolves immediately, sendMessage never called", async () => {
		cacheGetMock.mockResolvedValue({
			decision: "keep",
			source: "llm",
			timestamp: Date.now(),
		});

		const sendMessage = makeSendOk();
		const classifier = new Classifier(sendMessage);

		const result = await classifier.classify(makePost("cached"));
		expect(result).toEqual({ decision: "keep", source: "llm" });
		expect(sendMessage).not.toHaveBeenCalled();
	});

	it("cache hit with source: 'error': NOT reused, goes to network", async () => {
		cacheGetMock.mockResolvedValue({
			decision: "keep",
			source: "error",
			timestamp: Date.now(),
		});

		const sendMessage = makeSendOk();
		const classifier = new Classifier(sendMessage);

		const post = makePost("err-cached");
		const promise = classifier.classify(post);
		await drain(); // classify resumes; error source → not used, goes to network

		jest.advanceTimersByTime(BATCH_WINDOW_MS); // fire flush
		await drain();

		expect(sendMessage).toHaveBeenCalledTimes(1);

		classifier.onBatchResult({
			post_id: "err-cached",
			decision: "hide",
			source: "llm",
		});
		const result = await promise;
		expect(result).toEqual({ decision: "hide", source: "llm" });
	});
});

// ── Classifier.onBatchResult ───────────────────────────────────────────────

describe("Classifier.onBatchResult", () => {
	it("resolves pending, calls decisionCache.set, clears timer", async () => {
		const sendMessage = makeSendOk();
		const classifier = new Classifier(sendMessage);

		const post = makePost("r1");
		const promise = classifier.classify(post);
		await drain();

		jest.advanceTimersByTime(BATCH_WINDOW_MS);
		await drain();

		classifier.onBatchResult({
			post_id: "r1",
			decision: "hide",
			source: "llm",
		});

		const result = await promise;
		expect(result).toEqual({ decision: "hide", source: "llm" });
		expect(cacheSetMock).toHaveBeenCalledWith("r1", "hide", "llm");
	});

	it("with unknown post_id: no-op (no throw)", () => {
		const classifier = new Classifier(makeSendOk());
		expect(() =>
			classifier.onBatchResult({
				post_id: "unknown",
				decision: "keep",
				source: "llm",
			}),
		).not.toThrow();
	});

	it("with error: 'quota_exceeded': fail-open, does NOT call decisionCache.set", async () => {
		const sendMessage = makeSendOk();
		const classifier = new Classifier(sendMessage);

		const promise = classifier.classify(makePost("quota-post"));
		await drain();

		jest.advanceTimersByTime(BATCH_WINDOW_MS);
		await drain();

		classifier.onBatchResult({
			post_id: "quota-post",
			error: "quota_exceeded",
		});

		const result = await promise;
		expect(result).toEqual({ decision: "keep", source: "error" });
		expect(cacheSetMock).not.toHaveBeenCalled();
	});
});

// ── Fail-open timeout ──────────────────────────────────────────────────────

describe("Classifier fail-open timeout", () => {
	it("firing the expiry timer resolves with {decision:'keep', source:'error'}", async () => {
		const classifier = new Classifier(makeSendOk());

		const promise = classifier.classify(makePost("timeout-post"));
		await drain(); // classify sets up expiry timer + flush timer

		jest.advanceTimersByTime(FETCH_TIMEOUT_MS + BATCH_RESULT_TIMEOUT_MS); // fire expiry timer

		const result = await promise;
		expect(result).toEqual({ decision: "keep", source: "error" });
	});
});

// ── Classifier.reset ───────────────────────────────────────────────────────

describe("Classifier.reset", () => {
	it("immediately fail-opens all pending, clears queue and flush timer", async () => {
		const sendMessage = makeSendOk();
		const classifier = new Classifier(sendMessage);

		const p1 = classifier.classify(makePost("reset-a"));
		const p2 = classifier.classify(makePost("reset-b"));
		await drain(); // let classify set up pending entries

		classifier.reset();

		const [r1, r2] = await Promise.all([p1, p2]);
		expect(r1).toEqual({ decision: "keep", source: "error" });
		expect(r2).toEqual({ decision: "keep", source: "error" });
	});
});

// ── sendMessage rejects ────────────────────────────────────────────────────

describe("Classifier sendMessage rejects", () => {
	it("failBatch resolves all affected pending with fail-open", async () => {
		const sendMessage = mock(async () => {
			throw new Error("network error");
		});
		const classifier = new Classifier(sendMessage);

		const post = makePost("fail-post");
		const promise = classifier.classify(post);
		await drain(); // classify sets up pending + timers

		jest.advanceTimersByTime(BATCH_WINDOW_MS); // fire flush timer
		await drain(); // flush runs, sendMessage throws, failBatch resolves pending

		const result = await promise;
		expect(result).toEqual({ decision: "keep", source: "error" });
	});
});
