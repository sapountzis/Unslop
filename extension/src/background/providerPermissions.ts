import {
	type InvalidBaseUrlResult,
	type ProviderPermissionOkResult,
	normalizeProviderBaseUrl,
} from "../lib/providerUrls";

type PermissionsContains = (
	permissions: chrome.permissions.Permissions,
) => Promise<boolean>;

type ProviderPermissionDependencies = {
	containsPermission?: PermissionsContains;
};

export type PermissionDeniedResult = {
	status: "permission_denied";
	origin: string;
};

export type ProviderPermissionResult =
	| ProviderPermissionOkResult
	| InvalidBaseUrlResult
	| PermissionDeniedResult;

export async function ensureProviderEndpointPermission(
	baseUrl: string,
	dependencies: ProviderPermissionDependencies = {},
): Promise<ProviderPermissionResult> {
	const normalized = normalizeProviderBaseUrl(baseUrl);
	if (normalized.status !== "ok") {
		return normalized;
	}

	const containsPermission =
		dependencies.containsPermission ??
		(async (permissions) => await chrome.permissions.contains(permissions));

	const permission = { origins: [normalized.originPattern] };
	const hasPermission = await containsPermission(permission);
	if (!hasPermission) {
		return {
			status: "permission_denied",
			origin: normalized.origin,
		};
	}

	return normalized;
}
