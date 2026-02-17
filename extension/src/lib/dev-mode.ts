export const DEV_MODE_STORAGE_KEY = "devMode";

export function resolveDevMode(raw: boolean | null | undefined): boolean {
	return raw === true;
}

export function toggleDevMode(current: boolean | null | undefined): boolean {
	return !resolveDevMode(current);
}
