import { describe, expect, it } from "bun:test";
import { createStorageFacade } from "./storageFacade";
import { DEFAULT_BASE_URL, DEFAULT_MODEL } from "../lib/config";

describe("StorageFacade (BYOK)", () => {
	it("returns provider settings with defaults when nothing is stored", async () => {
		const storage = createStorageFacade({
			getSync: async () => ({}),
		});

		const settings = await storage.getProviderSettings();
		expect(settings.apiKey).toBe("");
		expect(settings.baseUrl).toBe(DEFAULT_BASE_URL);
		expect(settings.model).toBe(DEFAULT_MODEL);
	});

	it("returns stored provider settings", async () => {
		const storage = createStorageFacade({
			getSync: async () => ({
				apiKey: "sk-abc",
				baseUrl: "https://openrouter.ai/api",
				model: "gpt-4o",
			}),
		});

		const settings = await storage.getProviderSettings();
		expect(settings.apiKey).toBe("sk-abc");
		expect(settings.baseUrl).toBe("https://openrouter.ai/api");
		expect(settings.model).toBe("gpt-4o");
	});

	it("hasApiKey returns true when apiKey is stored", async () => {
		const storage = createStorageFacade({
			getSync: async () => ({ apiKey: "sk-abc" }),
		});
		expect(await storage.hasApiKey()).toBe(true);
	});

	it("hasApiKey returns false when apiKey is empty string", async () => {
		const storage = createStorageFacade({
			getSync: async () => ({ apiKey: "" }),
		});
		expect(await storage.hasApiKey()).toBe(false);
	});

	it("hasApiKey returns false when apiKey is missing", async () => {
		const storage = createStorageFacade({
			getSync: async () => ({}),
		});
		expect(await storage.hasApiKey()).toBe(false);
	});

	it("setProviderSettings persists all fields", async () => {
		const writes: Record<string, unknown>[] = [];
		const storage = createStorageFacade({
			getSync: async () => ({}),
			setSync: async (items) => {
				writes.push(items);
			},
		});

		await storage.setProviderSettings({
			apiKey: "sk-xyz",
			baseUrl: "https://api.openai.com",
			model: "gpt-4.1-mini",
		});

		expect(writes).toHaveLength(1);
		expect(writes[0]).toMatchObject({
			apiKey: "sk-xyz",
			baseUrl: "https://api.openai.com",
			model: "gpt-4.1-mini",
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
			getSync: async () => ({ devMode: undefined }),
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
