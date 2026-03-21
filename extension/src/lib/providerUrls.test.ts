import { describe, expect, it } from "bun:test";
import { normalizeProviderBaseUrl } from "./providerUrls";

describe("providerUrls", () => {
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

	it("returns invalid_base_url for malformed base URL", () => {
		const result = normalizeProviderBaseUrl("not a url");
		expect(result.status).toBe("invalid_base_url");
		if (result.status === "invalid_base_url") {
			expect(result.reason).toContain("valid URL");
		}
	});

	it("keeps clean URLs directly", () => {
		const result = normalizeProviderBaseUrl("http://llamacpp-rig.local:8001");
		expect(result).toEqual({
			status: "ok",
			normalizedBaseUrl: "http://llamacpp-rig.local:8001",
			origin: "http://llamacpp-rig.local:8001",
			originPattern: "http://llamacpp-rig.local/*",
		});
	});
});
