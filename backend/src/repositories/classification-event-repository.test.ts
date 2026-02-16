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
	it("appendMany writes compact error-only telemetry rows", async () => {
		const { db, spies } = createInsertDbMock();
		const repository = createClassificationEventRepository({ db });

		await repository.appendMany([
			{
				contentFingerprint: "fp-1",
				postId: "post-1",
				providerHttpStatus: 429,
				providerErrorCode: "rate_limit",
				providerErrorType: "provider_error",
				providerErrorMessage: "rate limited",
			},
			{
				contentFingerprint: "fp-2",
				postId: "post-2",
				providerErrorMessage: "llm_error:timeout",
			},
		]);

		expect(spies.insert).toHaveBeenCalledTimes(1);
		expect(spies.values).toHaveBeenCalledTimes(1);
		expect(spies.values).toHaveBeenCalledWith([
			expect.objectContaining({
				contentFingerprint: "fp-1",
				postId: "post-1",
				attemptStatus: "error",
				providerHttpStatus: 429,
				providerErrorCode: "rate_limit",
				providerErrorType: "provider_error",
				providerErrorMessage: "rate limited",
				requestPayload: {},
				responsePayload: expect.objectContaining({ source: "error" }),
			}),
			expect.objectContaining({
				contentFingerprint: "fp-2",
				postId: "post-2",
				attemptStatus: "error",
				providerErrorMessage: "llm_error:timeout",
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
