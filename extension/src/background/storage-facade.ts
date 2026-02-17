import { resolveEnabled, toggleEnabled } from "../lib/enabled-state";

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
	setJwt: (jwt: string) => Promise<void>;
	clearJwt: () => Promise<void>;
	toggleEnabled: () => Promise<boolean>;
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
	};
}
