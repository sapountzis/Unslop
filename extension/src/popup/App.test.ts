import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { MESSAGE_TYPES } from "../lib/messages";
import { App } from "./App";

type StorageChangeListener = (
	changes: Record<string, { newValue?: unknown }>,
	areaName: string,
) => void;

describe("popup App live stats", () => {
	let root: HTMLElement;
	let localStats: {
		today: { keep: number; hide: number; total: number };
		last30Days: { keep: number; hide: number; total: number };
		allTime: { keep: number; hide: number; total: number };
		dailyBreakdown: unknown[];
	};
	let storageChangeListener: StorageChangeListener | null;

	beforeEach(() => {
		root = document.createElement("div");
		root.id = "app";
		document.body.appendChild(root);
		storageChangeListener = null;
		localStats = {
			today: { keep: 1, hide: 2, total: 3 },
			last30Days: { keep: 4, hide: 5, total: 9 },
			allTime: { keep: 6, hide: 7, total: 13 },
			dailyBreakdown: [],
		};

		(globalThis as unknown as {
			chrome: typeof chrome;
		}).chrome = {
			runtime: {
				getURL: (path: string) => `chrome-extension://test/${path}`,
				sendMessage: async (message: { type: string }) => {
					if (message.type === MESSAGE_TYPES.GET_LOCAL_STATS) {
						return localStats;
					}
					return null;
				},
			},
			storage: {
				sync: {
					get: async () => ({
						apiKey: "sk-test",
						enabled: true,
						hideRenderMode: "label",
						devMode: false,
					}),
				},
				local: {
					get: async () => ({}),
					set: async () => {},
					remove: async () => {},
				},
				onChanged: {
					addListener: (listener: StorageChangeListener) => {
						storageChangeListener = listener;
					},
					removeListener: () => {},
				},
			},
			permissions: {
				request: async () => true,
			},
		} as typeof chrome;
	});

	afterEach(() => {
		root.remove();
	});

	it("refreshes local stats when chrome storage updates localStats", async () => {
		const app = new App("app");
		await app.render();

		expect(root.textContent).toContain("2 hidden / 3 total");
		expect(root.textContent).toContain("5 hidden / 9 total");
		expect(root.textContent).toContain("7 hidden / 13 total");
		expect(storageChangeListener).not.toBeNull();

		localStats = {
			today: { keep: 8, hide: 1, total: 9 },
			last30Days: { keep: 10, hide: 11, total: 21 },
			allTime: { keep: 12, hide: 13, total: 25 },
			dailyBreakdown: [],
		};

		storageChangeListener?.({ localStats: { newValue: localStats } }, "local");
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(root.textContent).toContain("1 hidden / 9 total");
		expect(root.textContent).toContain("11 hidden / 21 total");
		expect(root.textContent).toContain("13 hidden / 25 total");
	});
});
