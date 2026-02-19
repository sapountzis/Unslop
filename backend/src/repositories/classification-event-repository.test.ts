import { describe, expect, it, mock } from "bun:test";
import type { Database } from "../db";
import { createClassificationEventRepository } from "./classification-event-repository";

function createInsertDbMock() {
	const values = mock(async () => undefined);
	const insert = mock(() => ({ values }));

	return {
		db: { insert } as unknown as Database,
		spies: { insert, values },
	};
}

describe("classification event repository", () => {
	it("appendMany writes success-only telemetry rows", async () => {
		const { db, spies } = createInsertDbMock();
		const repository = createClassificationEventRepository({ db });

		await repository.appendMany([
			{
				contentFingerprint: "fp-1",
				postId: "post-1",
				model: "gpt-4",
				decision: "keep",
				requestPayload: { post_id: "post-1", text: "hi", attachments: [] },
				responsePayload: {
					model: "gpt-4",
					scores: { u: 0.1, d: 0 },
					source: "llm",
					latency: 100,
					decision: "keep",
				},
			},
			{
				contentFingerprint: "fp-2",
				postId: "post-2",
				model: "gpt-4",
				decision: "hide",
				requestPayload: { post_id: "post-2", text: "bye", attachments: [] },
				responsePayload: {
					model: "gpt-4",
					scores: {},
					source: "llm",
					latency: 50,
					decision: "hide",
				},
			},
		]);

		expect(spies.insert).toHaveBeenCalledTimes(1);
		expect(spies.values).toHaveBeenCalledTimes(1);
		expect(spies.values).toHaveBeenCalledWith([
			expect.objectContaining({
				contentFingerprint: "fp-1",
				postId: "post-1",
				model: "gpt-4",
				attemptStatus: "success",
				requestPayload: { post_id: "post-1", text: "hi", attachments: [] },
				responsePayload: expect.objectContaining({
					model: "gpt-4",
					source: "llm",
					latency: 100,
					decision: "keep",
				}),
			}),
			expect.objectContaining({
				contentFingerprint: "fp-2",
				postId: "post-2",
				model: "gpt-4",
				attemptStatus: "success",
				responsePayload: expect.objectContaining({
					model: "gpt-4",
					source: "llm",
					decision: "hide",
				}),
			}),
		]);
	});

	it("appendMany is a no-op when there are no events", async () => {
		const { db, spies } = createInsertDbMock();
		const repository = createClassificationEventRepository({ db });

		await repository.appendMany([]);

		expect(spies.insert).not.toHaveBeenCalled();
		expect(spies.values).not.toHaveBeenCalled();
	});
});
