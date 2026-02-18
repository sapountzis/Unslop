import { resolveEnabled, toggleEnabled } from "../lib/enabledState";
import {
	DEV_MODE_STORAGE_KEY,
	resolveDevMode,
	toggleDevMode,
} from "../lib/devMode";

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

type AuthState = {
	jwt: string | null;
	enabled: boolean;
};

export type StorageFacade = {
	getJwt: () => Promise<string | null>;
	getAuthState: () => Promise<AuthState>;
	getDevMode: () => Promise<boolean>;
	setJwt: (jwt: string) => Promise<void>;
	clearJwt: () => Promise<void>;
	toggleEnabled: () => Promise<boolean>;
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
	const removeSync =
		dependencies.removeSync ??
		(async (keys) => {
			await chrome.storage.sync.remove(keys);
		});

	return {
		async getJwt(): Promise<string | null> {
			const storage = await getSync("jwt");
			const jwt = storage.jwt;
			return typeof jwt === "string" && jwt.length > 0 ? jwt : null;
		},
		async getAuthState(): Promise<AuthState> {
			const storage = await getSync(["jwt", "enabled"]);
			const jwt =
				typeof storage.jwt === "string" && storage.jwt.length > 0
					? storage.jwt
					: null;
			const enabledValue = storage.enabled as boolean | null | undefined;
			return {
				jwt,
				enabled: resolveEnabled(enabledValue),
			};
		},
		async getDevMode(): Promise<boolean> {
			const storage = await getSync(DEV_MODE_STORAGE_KEY);
			const raw = storage[DEV_MODE_STORAGE_KEY] as boolean | null | undefined;
			return resolveDevMode(raw);
		},
		async setJwt(jwt: string): Promise<void> {
			await setSync({ jwt });
		},
		async clearJwt(): Promise<void> {
			await removeSync("jwt");
		},
		async toggleEnabled(): Promise<boolean> {
			const current = await getSync("enabled");
			const enabledValue = current.enabled as boolean | null | undefined;
			const next = toggleEnabled(enabledValue);
			await setSync({ enabled: next });
			return next;
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
