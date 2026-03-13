type PermissionsContains = (
	permissions: chrome.permissions.Permissions,
) => Promise<boolean>;
type PermissionsRequest = (
	permissions: chrome.permissions.Permissions,
) => Promise<boolean>;

type ProviderPermissionDependencies = {
	containsPermission?: PermissionsContains;
	requestPermission?: PermissionsRequest;
};

type InvalidBaseUrlResult = {
	status: "invalid_base_url";
	reason: string;
};

type PermissionDeniedResult = {
	status: "permission_denied";
	origin: string;
};

type ProviderPermissionOkResult = {
	status: "ok";
	normalizedBaseUrl: string;
	origin: string;
	originPattern: string;
};

export type ProviderPermissionResult =
	| ProviderPermissionOkResult
	| InvalidBaseUrlResult
	| PermissionDeniedResult;

function invalidBaseUrl(reason: string): InvalidBaseUrlResult {
	return {
		status: "invalid_base_url",
		reason,
	};
}

export function normalizeProviderBaseUrl(
	baseUrl: string,
): ProviderPermissionOkResult | InvalidBaseUrlResult {
	const trimmed = baseUrl.trim();
	if (trimmed.length === 0) {
		return invalidBaseUrl("Base URL is required.");
	}

	let parsed: URL;
	try {
		parsed = new URL(trimmed);
	} catch {
		return invalidBaseUrl("Base URL is not a valid URL.");
	}

	if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
		return invalidBaseUrl("Base URL must use http:// or https://.");
	}
	if (parsed.hostname.length === 0) {
		return invalidBaseUrl("Base URL must include a hostname.");
	}
	if (parsed.username || parsed.password) {
		return invalidBaseUrl("Base URL must not include embedded credentials.");
	}

	parsed.hash = "";
	parsed.search = "";

	const trimmedPath = parsed.pathname.replace(/\/+$/, "");
	const normalizedPath = trimmedPath.length > 0 ? trimmedPath : "";
	const origin = parsed.origin;
	const originPattern = `${origin}/*`;
	const normalizedBaseUrl = `${origin}${normalizedPath}`;

	return {
		status: "ok",
		normalizedBaseUrl,
		origin,
		originPattern,
	};
}

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
	const requestPermission =
		dependencies.requestPermission ??
		(async (permissions) => await chrome.permissions.request(permissions));

	const permission = { origins: [normalized.originPattern] };
	const hasPermission = await containsPermission(permission);
	if (hasPermission) {
		return normalized;
	}

	const granted = await requestPermission(permission);
	if (!granted) {
		return {
			status: "permission_denied",
			origin: normalized.origin,
		};
	}

	return normalized;
}
