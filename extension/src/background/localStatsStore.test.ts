import { beforeEach, describe, expect, it } from "bun:test";
import {
	LOCAL_STATS_STORAGE_KEY,
	createLocalStatsStore,
} from "./localStatsStore";

function toDateKey(date: Date): string {
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, "0");
	const d = String(date.getDate()).padStart(2, "0");
	return `${y}-${m}-${d}`;
}

describe("localStatsStore", () => {
	let storage: Record<string, unknown>;
	let now = new Date("2026-03-01T10:00:00");

	const getLocal = async (key: string): Promise<Record<string, unknown>> => ({
		[key]: storage[key],
	});
	const setLocal = async (items: Record<string, unknown>): Promise<void> => {
		storage = { ...storage, ...items };
	};

	beforeEach(() => {
		storage = {};
		now = new Date("2026-03-01T10:00:00");
	});

	it("increments keep/hide/total counters and preserves daily breakdown", async () => {
		const statsStore = createLocalStatsStore({
			getLocal,
			setLocal,
			now: () => now,
		});

		await statsStore.incrementDecision("hide");
		await statsStore.incrementDecision("hide");
		await statsStore.incrementDecision("keep");
		const stats = await statsStore.getLocalStats();

		expect(stats.today).toEqual({ keep: 1, hide: 2, total: 3 });
		expect(stats.last30Days).toEqual({ keep: 1, hide: 2, total: 3 });
		expect(stats.allTime).toEqual({ keep: 1, hide: 2, total: 3 });
		expect(stats.dailyBreakdown).toHaveLength(30);
		expect(stats.dailyBreakdown[29]).toEqual({
			date: "2026-03-01",
			keep: 1,
			hide: 2,
			total: 3,
		});
	});

	it("rolls over today counters when date changes while preserving all-time totals", async () => {
		const statsStore = createLocalStatsStore({
			getLocal,
			setLocal,
			now: () => now,
		});

		await statsStore.incrementDecision("hide");

		now = new Date("2026-03-02T11:00:00");
		let stats = await statsStore.getLocalStats();
		expect(stats.today).toEqual({ keep: 0, hide: 0, total: 0 });
		expect(stats.last30Days).toEqual({ keep: 0, hide: 1, total: 1 });
		expect(stats.allTime).toEqual({ keep: 0, hide: 1, total: 1 });

		await statsStore.incrementDecision("keep");
		stats = await statsStore.getLocalStats();
		expect(stats.today).toEqual({ keep: 1, hide: 0, total: 1 });
		expect(stats.last30Days).toEqual({ keep: 1, hide: 1, total: 2 });
		expect(stats.allTime).toEqual({ keep: 1, hide: 1, total: 2 });
		expect(stats.dailyBreakdown[29]?.date).toBe("2026-03-02");
	});

	it("retains only the last 30 days in daily breakdown while keeping all-time totals", async () => {
		const statsStore = createLocalStatsStore({
			getLocal,
			setLocal,
			now: () => now,
		});

		const start = new Date("2026-01-01T10:00:00");
		for (let i = 0; i < 35; i += 1) {
			const date = new Date(start);
			date.setDate(start.getDate() + i);
			now = date;
			await statsStore.incrementDecision("hide");
		}

		const stats = await statsStore.getLocalStats();
		expect(stats.dailyBreakdown).toHaveLength(30);
		expect(stats.last30Days).toEqual({ keep: 0, hide: 30, total: 30 });
		expect(stats.allTime).toEqual({ keep: 0, hide: 35, total: 35 });
		expect(stats.dailyBreakdown[0]?.date).toBe("2026-01-06");
		expect(stats.dailyBreakdown[29]?.date).toBe("2026-02-04");
	});

	it("returns zeroed snapshot when storage is empty", async () => {
		const statsStore = createLocalStatsStore({
			getLocal,
			setLocal,
			now: () => now,
		});

		const stats = await statsStore.getLocalStats();
		expect(stats.today).toEqual({ keep: 0, hide: 0, total: 0 });
		expect(stats.last30Days).toEqual({ keep: 0, hide: 0, total: 0 });
		expect(stats.allTime).toEqual({ keep: 0, hide: 0, total: 0 });
		expect(stats.dailyBreakdown).toHaveLength(30);
		expect(storage[LOCAL_STATS_STORAGE_KEY]).toBeUndefined();
		expect(stats.dailyBreakdown[29]?.date).toBe(toDateKey(now));
	});
});
