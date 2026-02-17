import { describe, expect, it, mock } from "bun:test";
import type { Database } from "../db";
import { createActivityRepository } from "./activity-repository";

function createInsertDbMock() {
	const values = mock(async () => undefined);
	const insert = mock(() => ({ values }));

	return {
		db: { insert } as unknown as Database,
		spies: { insert, values },
	};
}

describe("activity repository", () => {
	it("insertMany performs one bulk insert", async () => {
		const { db, spies } = createInsertDbMock();
		const repository = createActivityRepository({ db });

		await repository.insertMany([
			{
				userId: "user-1",
				postId: "post-1",
				decision: "hide",
				source: "cache",
			},
			{
				userId: "user-1",
				postId: "post-2",
				decision: "keep",
				source: "llm",
			},
		]);

		expect(spies.insert).toHaveBeenCalledTimes(1);
		expect(spies.values).toHaveBeenCalledTimes(1);
		expect(spies.values).toHaveBeenCalledWith([
			expect.objectContaining({ postId: "post-1", source: "cache" }),
			expect.objectContaining({ postId: "post-2", source: "llm" }),
		]);
	});

	it("insertMany is a no-op for empty input", async () => {
		const { db, spies } = createInsertDbMock();
		const repository = createActivityRepository({ db });

		await repository.insertMany([]);

		expect(spies.insert).not.toHaveBeenCalled();
		expect(spies.values).not.toHaveBeenCalled();
	});
});
