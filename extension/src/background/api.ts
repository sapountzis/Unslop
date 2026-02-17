// extension/src/background/api.ts
import {
	BatchClassifyRequest,
	BatchClassifyResult,
	UserInfo,
	UserInfoWithUsage,
	UsageInfo,
	StatsInfo,
} from "../types";
import { API_BASE_URL, FETCH_TIMEOUT_MS } from "../lib/config";
import { parseNdjson } from "./ndjson";

const API_BASE = `${API_BASE_URL}/v1`;

// In-flight request deduplication
const pendingRequests = new Map<string, Promise<any>>();

async function dedupedRequest<T>(
	key: string,
	factory: () => Promise<T>,
): Promise<T> {
	const existing = pendingRequests.get(key);
	if (existing) {
		return existing as Promise<T>;
	}

	const promise = factory().finally(() => {
		pendingRequests.delete(key);
	});

	pendingRequests.set(key, promise);
	return promise;
}

async function fetchWithTimeout(
	url: string,
	options: RequestInit = {},
): Promise<Response> {
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

	try {
		const response = await fetch(url, {
			...options,
			signal: controller.signal,
		});
		clearTimeout(timeoutId);
		return response;
	} catch (error) {
		clearTimeout(timeoutId);
		if (error instanceof Error && error.name === "AbortError") {
			throw new Error(`Request timeout after ${FETCH_TIMEOUT_MS}ms`);
		}
		throw error;
	}
}

export async function classifyPostsBatch(
	request: BatchClassifyRequest,
	jwt: string,
	onItem: (item: BatchClassifyResult) => void,
): Promise<void> {
	const response = await fetchWithTimeout(`${API_BASE}/classify/batch`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${jwt}`,
		},
		body: JSON.stringify(request),
	});

	if (!response.ok) {
		if (response.status === 401) {
			await chrome.storage.sync.remove("jwt");
		}
		return;
	}

	if (!response.body) {
		return;
	}

	for await (const item of parseNdjson<BatchClassifyResult>(response.body)) {
		onItem(item);
	}
}

export async function getUserInfoWithUsage(
	jwt: string,
): Promise<UserInfoWithUsage | null> {
	return dedupedRequest("getUserInfo", async () => {
		let retries = 0;
		const maxRetries = 1;

		while (retries <= maxRetries) {
			try {
				const response = await fetchWithTimeout(`${API_BASE}/me`, {
					headers: { Authorization: `Bearer ${jwt}` },
				});

				// 401 Unauthorized - clear JWT
				if (response.status === 401) {
					await chrome.storage.sync.remove("jwt");
					return null;
				}

				// 404 Not Found - user not found
				if (response.status === 404) {
					return null;
				}

				// Success
				if (response.ok) {
					return await response.json();
				}

				// 5xx errors - retry
				if (response.status >= 500 && retries < maxRetries) {
					retries++;
					await new Promise((r) => setTimeout(r, 1000 * retries));
					continue;
				}

				// Other 4xx errors - don't retry
				return null;
			} catch (error) {
				// Network or timeout error - retry
				if (retries < maxRetries) {
					retries++;
					await new Promise((r) => setTimeout(r, 1000 * retries));
					continue;
				}
				// Final retry failed
				console.error("getUserInfo failed after retries:", error);
				return null;
			}
		}

		return null;
	});
}

export async function createCheckout(jwt: string): Promise<string | null> {
	return dedupedRequest("createCheckout", async () => {
		let retries = 0;
		const maxRetries = 1;

		while (retries <= maxRetries) {
			try {
				const response = await fetchWithTimeout(
					`${API_BASE}/billing/create-checkout`,
					{
						method: "POST",
						headers: {
							"Content-Type": "application/json",
							Authorization: `Bearer ${jwt}`,
						},
						body: JSON.stringify({ plan: "pro-monthly" }),
					},
				);

				if (response.ok) {
					const data = await response.json();
					return data.checkout_url;
				}

				// 5xx errors - retry
				if (response.status >= 500 && retries < maxRetries) {
					retries++;
					await new Promise((r) => setTimeout(r, 1000 * retries));
					continue;
				}

				// Other errors - don't retry
				return null;
			} catch (error) {
				// Network or timeout error - retry
				if (retries < maxRetries) {
					retries++;
					await new Promise((r) => setTimeout(r, 1000 * retries));
					continue;
				}
				// Final retry failed
				console.error("createCheckout failed after retries:", error);
				return null;
			}
		}

		return null;
	});
}

export async function startAuthFlow(email: string): Promise<void> {
	return dedupedRequest("startAuthFlow", async () => {
		let retries = 0;
		const maxRetries = 1;

		while (retries <= maxRetries) {
			try {
				const response = await fetchWithTimeout(`${API_BASE}/auth/start`, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ email }),
				});

				// 202 means email was sent
				if (response.status === 202) {
					return;
				}

				// 5xx errors - retry
				if (response.status >= 500 && retries < maxRetries) {
					retries++;
					await new Promise((r) => setTimeout(r, 1000 * retries));
					continue;
				}

				// Other errors - don't retry
				throw new Error("Failed to start auth flow");
			} catch (error) {
				// Network or timeout error - retry
				if (retries < maxRetries) {
					retries++;
					await new Promise((r) => setTimeout(r, 1000 * retries));
					continue;
				}
				// Final retry failed
				throw new Error("Failed to start auth flow");
			}
		}
	});
}

export async function getStats(jwt: string): Promise<StatsInfo | null> {
	return dedupedRequest("getStats", async () => {
		let retries = 0;
		const maxRetries = 1;

		while (retries <= maxRetries) {
			try {
				const response = await fetchWithTimeout(`${API_BASE}/stats`, {
					headers: { Authorization: `Bearer ${jwt}` },
				});

				if (response.ok) {
					return await response.json();
				}

				// 5xx errors - retry
				if (response.status >= 500 && retries < maxRetries) {
					retries++;
					await new Promise((r) => setTimeout(r, 1000 * retries));
					continue;
				}

				// Other errors - don't retry
				return null;
			} catch (error) {
				// Network or timeout error - retry
				if (retries < maxRetries) {
					retries++;
					await new Promise((r) => setTimeout(r, 1000 * retries));
					continue;
				}
				// Final retry failed
				console.error("getStats failed after retries:", error);
				return null;
			}
		}

		return null;
	});
}
