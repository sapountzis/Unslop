import type { Decision, DecisionCounts, LocalStatsDay, LocalStatsSnapshot } from "../types";

export const LOCAL_STATS_STORAGE_KEY = "localStats";
const DAILY_WINDOW_DAYS = 30;

type LocalStorageGet = (key: string) => Promise<Record<string, unknown>>;
type LocalStorageSet = (items: Record<string, unknown>) => Promise<void>;
type NowFn = () => Date;

type LocalStatsStoreDependencies = {
	getLocal?: LocalStorageGet;
	setLocal?: LocalStorageSet;
	now?: NowFn;
};

function zeroCounts(): DecisionCounts {
	return { keep: 0, hide: 0, total: 0 };
}

function safeCount(value: unknown): number {
	return typeof value === "number" && Number.isFinite(value) && value >= 0
		? Math.floor(value)
		: 0;
}

function normalizeCounts(value: unknown): DecisionCounts {
	if (!value || typeof value !== "object") {
		return zeroCounts();
	}
	const maybe = value as Partial<DecisionCounts>;
	const keep = safeCount(maybe.keep);
	const hide = safeCount(maybe.hide);
	const total = Math.max(safeCount(maybe.total), keep + hide);
	return { keep, hide, total };
}

function toDateKey(date: Date): string {
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, "0");
	const d = String(date.getDate()).padStart(2, "0");
	return `${y}-${m}-${d}`;
}

function buildRecentDateKeys(today: Date): string[] {
	const todayMidnight = new Date(
		today.getFullYear(),
		today.getMonth(),
		today.getDate(),
	);
	const keys: string[] = [];

	for (let i = DAILY_WINDOW_DAYS - 1; i >= 0; i -= 1) {
		const date = new Date(todayMidnight);
		date.setDate(todayMidnight.getDate() - i);
		keys.push(toDateKey(date));
	}

	return keys;
}

function normalizeDailyBreakdown(
	value: unknown,
	today: Date,
): LocalStatsDay[] {
	const recentKeys = buildRecentDateKeys(today);
	const recentKeySet = new Set(recentKeys);
	const map = new Map<string, DecisionCounts>();

	if (Array.isArray(value)) {
		for (const entry of value) {
			if (!entry || typeof entry !== "object") continue;
			const day = entry as Partial<LocalStatsDay>;
			if (typeof day.date !== "string" || !recentKeySet.has(day.date)) {
				continue;
			}
			map.set(day.date, normalizeCounts(day));
		}
	}

	return recentKeys.map((date) => {
		const counts = map.get(date) ?? zeroCounts();
		return {
			date,
			keep: counts.keep,
			hide: counts.hide,
			total: counts.total,
		};
	});
}

function summarize(days: LocalStatsDay[]): DecisionCounts {
	const total = zeroCounts();
	for (const day of days) {
		total.keep += day.keep;
		total.hide += day.hide;
		total.total += day.total;
	}
	return total;
}

function normalizeLocalStats(
	value: unknown,
	today: Date,
): LocalStatsSnapshot {
	const asObject =
		value && typeof value === "object"
			? (value as Partial<LocalStatsSnapshot>)
			: null;
	const dailyBreakdown = normalizeDailyBreakdown(asObject?.dailyBreakdown, today);
	const lastEntry = dailyBreakdown[dailyBreakdown.length - 1];
	const todayCounts = lastEntry
		? {
				keep: lastEntry.keep,
				hide: lastEntry.hide,
				total: lastEntry.total,
		  }
		: zeroCounts();

	return {
		today: todayCounts,
		last30Days: summarize(dailyBreakdown),
		allTime: normalizeCounts(asObject?.allTime),
		dailyBreakdown,
	};
}

export type LocalStatsStore = {
	getLocalStats: () => Promise<LocalStatsSnapshot>;
	incrementDecision: (decision: Decision) => Promise<void>;
};

export function createLocalStatsStore(
	dependencies: LocalStatsStoreDependencies = {},
): LocalStatsStore {
	const getLocal =
		dependencies.getLocal ??
		(async (key) => (await chrome.storage.local.get(key)) as Record<string, unknown>);
	const setLocal =
		dependencies.setLocal ??
		(async (items) => {
			await chrome.storage.local.set(items);
		});
	const now = dependencies.now ?? (() => new Date());

	async function readNormalized(): Promise<LocalStatsSnapshot> {
		const storage = await getLocal(LOCAL_STATS_STORAGE_KEY);
		return normalizeLocalStats(storage[LOCAL_STATS_STORAGE_KEY], now());
	}

	return {
		async getLocalStats(): Promise<LocalStatsSnapshot> {
			return await readNormalized();
		},

		async incrementDecision(decision: Decision): Promise<void> {
			const snapshot = await readNormalized();
			const latest = snapshot.dailyBreakdown[snapshot.dailyBreakdown.length - 1];
			if (!latest) return;

			latest[decision] += 1;
			latest.total += 1;
			snapshot.today = {
				keep: latest.keep,
				hide: latest.hide,
				total: latest.total,
			};
			snapshot.last30Days[decision] += 1;
			snapshot.last30Days.total += 1;
			snapshot.allTime[decision] += 1;
			snapshot.allTime.total += 1;

			await setLocal({ [LOCAL_STATS_STORAGE_KEY]: snapshot });
		},
	};
}
