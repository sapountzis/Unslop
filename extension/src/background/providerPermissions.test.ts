import { describe, expect, it, mock } from "bun:test";
import {
	ensureProviderEndpointPermission,
	normalizeProviderBaseUrl,
} from "./providerPermissions";

describe("providerPermissions", () => {
	it("normalizes valid base URLs and strips trailing slash/query", () => {
		const result = normalizeProviderBaseUrl(
			"https://openrouter.ai/api/?foo=bar#section",
		);
		expect(result).toEqual({
			status: "ok",
			normalizedBaseUrl: "https://openrouter.ai/api",
			origin: "https://openrouter.ai",
			originPattern: "https://openrouter.ai/*",
		});
	});

	it("returns invalid_base_url for malformed base URL", async () => {
		const result = await ensureProviderEndpointPermission("not a url");
		expect(result.status).toBe("invalid_base_url");
		if (result.status === "invalid_base_url") {
			expect(result.reason).toContain("valid URL");
		}
	});

	it("known host path returns ok without requesting permissions", async () => {
		const containsPermission = mock(async () => true);
		const requestPermission = mock(async () => true);

		const result = await ensureProviderEndpointPermission(
			"https://api.openai.com",
			{
				containsPermission,
				requestPermission,
			},
		);

		expect(result.status).toBe("ok");
		expect(containsPermission).toHaveBeenCalledTimes(1);
		expect(requestPermission).not.toHaveBeenCalled();
	});

	it("unknown host requests permission and succeeds when approved", async () => {
		const containsPermission = mock(async () => false);
		const requestPermission = mock(async () => true);

		const result = await ensureProviderEndpointPermission(
			"https://llm.example.com",
			{
				containsPermission,
				requestPermission,
			},
		);

		expect(result).toEqual({
			status: "ok",
			normalizedBaseUrl: "https://llm.example.com",
			origin: "https://llm.example.com",
			originPattern: "https://llm.example.com/*",
		});
		expect(containsPermission).toHaveBeenCalledTimes(1);
		expect(requestPermission).toHaveBeenCalledTimes(1);
	});

	it("unknown host returns permission_denied when user rejects prompt", async () => {
		const containsPermission = mock(async () => false);
		const requestPermission = mock(async () => false);

		const result = await ensureProviderEndpointPermission(
			"https://custom.inference.host",
			{
				containsPermission,
				requestPermission,
			},
		);

		expect(result).toEqual({
			status: "permission_denied",
			origin: "https://custom.inference.host",
		});
		expect(containsPermission).toHaveBeenCalledTimes(1);
		expect(requestPermission).toHaveBeenCalledTimes(1);
	});
});
