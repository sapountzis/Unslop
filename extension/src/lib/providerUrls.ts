export type InvalidBaseUrlResult = {
	status: "invalid_base_url";
	reason: string;
};

export type ProviderPermissionOkResult = {
	status: "ok";
	normalizedBaseUrl: string;
	origin: string;
	originPattern: string;
};

export type NormalizeBaseUrlResult =
	| ProviderPermissionOkResult
	| InvalidBaseUrlResult;

function invalidBaseUrl(reason: string): InvalidBaseUrlResult {
	return {
		status: "invalid_base_url",
		reason,
	};
}

export function normalizeProviderBaseUrl(
	baseUrl: string,
): NormalizeBaseUrlResult {
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
	const originPattern = `${parsed.protocol}//${parsed.hostname}/*`;
	const normalizedBaseUrl = `${origin}${normalizedPath}`;

	return {
		status: "ok",
		normalizedBaseUrl,
		origin,
		originPattern,
	};
}
