import { describe, expect, it } from "bun:test";
import { createStorageFacade } from "./storage-facade";

describe("background storage facade", () => {
	it("normalizes jwt and enabled state in auth snapshot", async () => {
		const storage = createStorageFacade({
			getSync: async () => ({
				jwt: "",
				enabled: undefined,
			}),
		});

		const snapshot = await storage.getAuthState();
		expect(snapshot).toEqual({
			jwt: null,
			enabled: true,
		});
	});

	it("toggles enabled state and persists new value", async () => {
		const writes: Record<string, unknown>[] = [];
		const storage = createStorageFacade({
			getSync: async () => ({ enabled: true }),
			setSync: async (items) => {
				writes.push(items);
			},
		});

		const next = await storage.toggleEnabled();

		expect(next).toBe(false);
		expect(writes).toEqual([{ enabled: false }]);
	});

	it("treats missing developer mode as disabled", async () => {
		const storage = createStorageFacade({
			getSync: async () => ({
				devMode: undefined,
			}),
		});

		expect(await storage.getDevMode()).toBe(false);
	});

	it("toggles developer mode and persists new value", async () => {
		const writes: Record<string, unknown>[] = [];
		const storage = createStorageFacade({
			getSync: async () => ({ devMode: false }),
			setSync: async (items) => {
				writes.push(items);
			},
		});

		const next = await storage.toggleDevMode();

		expect(next).toBe(true);
		expect(writes).toEqual([{ devMode: true }]);
	});
});
