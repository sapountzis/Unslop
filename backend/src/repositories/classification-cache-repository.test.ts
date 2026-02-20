import { describe, expect, it, mock } from "bun:test";
import type { Database } from "../db";
import { createClassificationCacheRepository } from "./classification-cache-repository";

function createSingleSelectDbMock(rows: Array<Record<string, unknown>>) {
	const limit = mock(async () => rows);
	const where = mock(() => ({ limit }));
	const from = mock(() => ({ where }));
	const select = mock(() => ({ from }));

	return {
		db: { select } as unknown as Database,
		spies: { select, from, where, limit },
	};
}

function createBulkSelectDbMock(rows: Array<Record<string, unknown>>) {
	const where = mock(async () => rows);
	const from = mock(() => ({ where }));
	const select = mock(() => ({ from }));

	return {
		db: { select } as unknown as Database,
		spies: { select, from, where },
	};
}

function createInsertDbMock() {
	const onConflictDoNothing = mock(async () => undefined);
	const values = mock(() => ({ onConflictDoNothing }));
	const insert = mock(() => ({ values }));

	return {
		db: { insert } as unknown as Database,
		spies: { insert, values, onConflictDoNothing },
	};
}

describe("classification cache repository", () => {
	it("findByFingerprint returns cached entry", async () => {
		const rowCreatedAt = new Date("2026-01-01T12:00:00.000Z");

		const { db, spies } = createSingleSelectDbMock([
			{
				contentFingerprint: "fp-1",
				decision: "hide",
				createdAt: rowCreatedAt,
				updatedAt: rowCreatedAt,
			},
		]);

		const repository = createClassificationCacheRepository({ db });
		const result = await repository.findByFingerprint("fp-1");

		expect(result).not.toBeNull();
		expect(result).toEqual(
			expect.objectContaining({
				contentFingerprint: "fp-1",
				decision: "hide",
			}),
		);
		expect(spies.select).toHaveBeenCalledTimes(1);
		expect(spies.limit).toHaveBeenCalledWith(1);
	});

	it("findByFingerprint returns null for missing entry", async () => {
		const { db } = createSingleSelectDbMock([]);

		const repository = createClassificationCacheRepository({ db });
		const result = await repository.findByFingerprint("fp-missing");

		expect(result).toBeNull();
	});

	it("findByFingerprints returns entries keyed by fingerprint", async () => {
		const rowCreatedAt = new Date("2026-01-01T12:00:00.000Z");

		const { db, spies } = createBulkSelectDbMock([
			{
				contentFingerprint: "fp-1",
				decision: "keep",
				createdAt: rowCreatedAt,
				updatedAt: rowCreatedAt,
			},
			{
				contentFingerprint: "fp-2",
				decision: "hide",
				createdAt: rowCreatedAt,
				updatedAt: rowCreatedAt,
			},
		]);

		const repository = createClassificationCacheRepository({ db });
		const result = await repository.findByFingerprints([
			"fp-1",
			"fp-2",
			"fp-missing",
		]);

		expect(spies.select).toHaveBeenCalledTimes(1);
		expect(spies.where).toHaveBeenCalledTimes(1);
		expect(result.size).toBe(2);
		expect(result.get("fp-1")).toEqual(
			expect.objectContaining({ decision: "keep" }),
		);
		expect(result.get("fp-2")).toEqual(
			expect.objectContaining({ decision: "hide" }),
		);
		expect(result.get("fp-missing")).toBeUndefined();
	});

	it("findByFingerprints handles empty input without querying", async () => {
		const select = mock(() => {
			throw new Error("select should not be called");
		});
		const db = { select } as unknown as Database;
		const repository = createClassificationCacheRepository({ db });

		const result = await repository.findByFingerprints([]);

		expect(result.size).toBe(0);
		expect(select).not.toHaveBeenCalled();
	});

	it("insertMany performs one bulk insert with onConflictDoNothing", async () => {
		const { db, spies } = createInsertDbMock();
		const repository = createClassificationCacheRepository({ db });

		await repository.insertMany([
			{ contentFingerprint: "fp-1", decision: "keep" },
			{ contentFingerprint: "fp-2", decision: "hide" },
		]);

		expect(spies.insert).toHaveBeenCalledTimes(1);
		expect(spies.values).toHaveBeenCalledTimes(1);
		expect(spies.values).toHaveBeenCalledWith([
			expect.objectContaining({
				contentFingerprint: "fp-1",
				decision: "keep",
			}),
			expect.objectContaining({
				contentFingerprint: "fp-2",
				decision: "hide",
			}),
		]);
		expect(spies.onConflictDoNothing).toHaveBeenCalledTimes(1);
	});

	it("insertMany is a no-op for empty input", async () => {
		const { db, spies } = createInsertDbMock();
		const repository = createClassificationCacheRepository({ db });

		await repository.insertMany([]);

		expect(spies.insert).not.toHaveBeenCalled();
		expect(spies.values).not.toHaveBeenCalled();
		expect(spies.onConflictDoNothing).not.toHaveBeenCalled();
	});
});
