// extension/src/background/storageFacade.ts
import { resolveEnabled, toggleEnabled } from "../lib/enabledState";
import {
	DEV_MODE_STORAGE_KEY,
	resolveDevMode,
	toggleDevMode,
} from "../lib/devMode";
import { DEFAULT_BASE_URL, DEFAULT_MODEL } from "../lib/config";
import type { ProviderSettings } from "../types";

type SyncStorageGet = (
	keys: string | string[],
) => Promise<Record<string, unknown>>;
type SyncStorageSet = (items: Record<string, unknown>) => Promise<void>;
type SyncStorageRemove = (keys: string | string[]) => Promise<void>;

type StorageFacadeDependencies = {
	getSync?: SyncStorageGet;
	setSync?: SyncStorageSet;
	removeSync?: SyncStorageRemove;
};

const PROVIDER_KEYS = ["apiKey", "baseUrl", "model"] as const;

export type StorageFacade = {
	getProviderSettings: () => Promise<ProviderSettings>;
	setProviderSettings: (settings: ProviderSettings) => Promise<void>;
	hasApiKey: () => Promise<boolean>;
	getEnabled: () => Promise<boolean>;
	toggleEnabled: () => Promise<boolean>;
	getDevMode: () => Promise<boolean>;
	toggleDevMode: () => Promise<boolean>;
};

export function createStorageFacade(
	dependencies: StorageFacadeDependencies = {},
): StorageFacade {
	const getSync =
		dependencies.getSync ??
		(async (keys) =>
			(await chrome.storage.sync.get(keys)) as Record<string, unknown>);
	const setSync =
		dependencies.setSync ??
		(async (items) => {
			await chrome.storage.sync.set(items);
		});

	return {
		async getProviderSettings(): Promise<ProviderSettings> {
			const storage = await getSync([...PROVIDER_KEYS]);
			return {
				apiKey: typeof storage.apiKey === "string" ? storage.apiKey : "",
				baseUrl:
					typeof storage.baseUrl === "string" && storage.baseUrl.length > 0
						? storage.baseUrl
						: DEFAULT_BASE_URL,
				model:
					typeof storage.model === "string" && storage.model.length > 0
						? storage.model
						: DEFAULT_MODEL,
			};
		},

		async setProviderSettings(settings: ProviderSettings): Promise<void> {
			await setSync({
				apiKey: settings.apiKey,
				baseUrl: settings.baseUrl || DEFAULT_BASE_URL,
				model: settings.model || DEFAULT_MODEL,
			});
		},

		async hasApiKey(): Promise<boolean> {
			const storage = await getSync("apiKey");
			return typeof storage.apiKey === "string" && storage.apiKey.length > 0;
		},

		async getEnabled(): Promise<boolean> {
			const storage = await getSync("enabled");
			return resolveEnabled(storage.enabled as boolean | null | undefined);
		},

		async toggleEnabled(): Promise<boolean> {
			const current = await getSync("enabled");
			const enabledValue = current.enabled as boolean | null | undefined;
			const next = toggleEnabled(enabledValue);
			await setSync({ enabled: next });
			return next;
		},

		async getDevMode(): Promise<boolean> {
			const storage = await getSync(DEV_MODE_STORAGE_KEY);
			const raw = storage[DEV_MODE_STORAGE_KEY] as boolean | null | undefined;
			return resolveDevMode(raw);
		},

		async toggleDevMode(): Promise<boolean> {
			const current = await getSync(DEV_MODE_STORAGE_KEY);
			const raw = current[DEV_MODE_STORAGE_KEY] as boolean | null | undefined;
			const next = toggleDevMode(raw);
			await setSync({ [DEV_MODE_STORAGE_KEY]: next });
			return next;
		},
	};
}
