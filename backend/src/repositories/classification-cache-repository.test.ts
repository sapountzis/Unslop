import { describe, expect, it, mock } from "bun:test";
import type { Database } from "../db";
import { createClassificationCacheRepository } from "./classification-cache-repository";

const DAY_MS = 24 * 60 * 60 * 1000;

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
	const onConflictDoUpdate = mock(async () => undefined);
	const values = mock(() => ({ onConflictDoUpdate }));
	const insert = mock(() => ({ values }));

	return {
		db: { insert } as unknown as Database,
		spies: { insert, values, onConflictDoUpdate },
	};
}

describe("classification cache repository", () => {
	it("findFreshByFingerprint respects 30-day freshness", async () => {
		const now = new Date("2026-02-09T12:00:00.000Z");
		const cutoff = new Date(now.getTime() - 30 * DAY_MS);
		const rowCreatedAt = new Date(now.getTime() - 29 * DAY_MS);

		const { db, spies } = createSingleSelectDbMock([
			{
				contentFingerprint: "fp-1",
				decision: "hide",
				createdAt: rowCreatedAt,
				updatedAt: rowCreatedAt,
			},
		]);

		const repository = createClassificationCacheRepository({ db });
		const result = await repository.findFreshByFingerprint("fp-1", cutoff);

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

	it("stale cache misses after 31 days", async () => {
		const now = new Date("2026-02-09T12:00:00.000Z");
		const cutoff = new Date(now.getTime() - 30 * DAY_MS);
		const rowCreatedAt = new Date(now.getTime() - 31 * DAY_MS);

		const { db } = createSingleSelectDbMock([
			{
				contentFingerprint: "fp-2",
				decision: "keep",
				createdAt: rowCreatedAt,
				updatedAt: rowCreatedAt,
			},
		]);

		const repository = createClassificationCacheRepository({ db });
		const result = await repository.findFreshByFingerprint("fp-2", cutoff);

		expect(result).toBeNull();
	});

	it("findFreshByFingerprints returns fresh hits keyed by fingerprint", async () => {
		const now = new Date("2026-02-09T12:00:00.000Z");
		const cutoff = new Date(now.getTime() - 30 * DAY_MS);
		const freshCreatedAt = new Date(now.getTime() - 10 * DAY_MS);
		const staleCreatedAt = new Date(now.getTime() - 35 * DAY_MS);

		const { db, spies } = createBulkSelectDbMock([
			{
				contentFingerprint: "fp-fresh-1",
				decision: "keep",
				createdAt: freshCreatedAt,
				updatedAt: freshCreatedAt,
			},
			{
				contentFingerprint: "fp-stale",
				decision: "hide",
				createdAt: staleCreatedAt,
				updatedAt: staleCreatedAt,
			},
			{
				contentFingerprint: "fp-fresh-2",
				decision: "hide",
				createdAt: freshCreatedAt,
				updatedAt: freshCreatedAt,
			},
		]);

		const repository = createClassificationCacheRepository({ db });
		const result = await repository.findFreshByFingerprints(
			["fp-fresh-1", "fp-stale", "fp-fresh-2"],
			cutoff,
		);

		expect(spies.select).toHaveBeenCalledTimes(1);
		expect(spies.where).toHaveBeenCalledTimes(1);
		expect(result.size).toBe(2);
		expect(result.get("fp-fresh-1")).toEqual(
			expect.objectContaining({ decision: "keep" }),
		);
		expect(result.get("fp-stale")).toBeUndefined();
		expect(result.get("fp-fresh-2")).toEqual(
			expect.objectContaining({ decision: "hide" }),
		);
	});

	it("findFreshByFingerprints handles empty input without querying", async () => {
		const select = mock(() => {
			throw new Error("select should not be called");
		});
		const db = { select } as unknown as Database;
		const repository = createClassificationCacheRepository({ db });

		const result = await repository.findFreshByFingerprints([], new Date());

		expect(result.size).toBe(0);
		expect(select).not.toHaveBeenCalled();
	});

	it("upsertMany performs one bulk upsert statement", async () => {
		const { db, spies } = createInsertDbMock();
		const repository = createClassificationCacheRepository({ db });

		await repository.upsertMany([
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
		expect(spies.onConflictDoUpdate).toHaveBeenCalledTimes(1);
	});

	it("upsertMany is a no-op for empty input", async () => {
		const { db, spies } = createInsertDbMock();
		const repository = createClassificationCacheRepository({ db });

		await repository.upsertMany([]);

		expect(spies.insert).not.toHaveBeenCalled();
		expect(spies.values).not.toHaveBeenCalled();
		expect(spies.onConflictDoUpdate).not.toHaveBeenCalled();
	});
});
