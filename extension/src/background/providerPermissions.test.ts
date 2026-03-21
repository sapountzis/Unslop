import { describe, expect, it, mock } from "bun:test";
import { ensureProviderEndpointPermission } from "./providerPermissions";

describe("providerPermissions", () => {
	it("returns invalid_base_url for malformed base URL", async () => {
		const result = await ensureProviderEndpointPermission("not a url");
		expect(result.status).toBe("invalid_base_url");
		if (result.status === "invalid_base_url") {
			expect(result.reason).toContain("valid URL");
		}
	});

	it("known host path returns ok when permission exists", async () => {
		const containsPermission = mock(async () => true);

		const result = await ensureProviderEndpointPermission(
			"https://api.openai.com",
			{
				containsPermission,
			},
		);

		expect(result.status).toBe("ok");
		expect(containsPermission).toHaveBeenCalledTimes(1);
	});

	it("unknown host returns permission_denied when permission does not exist", async () => {
		const containsPermission = mock(async () => false);

		const result = await ensureProviderEndpointPermission(
			"https://custom.inference.host",
			{
				containsPermission,
			},
		);

		expect(result).toEqual({
			status: "permission_denied",
			origin: "https://custom.inference.host",
		});
		expect(containsPermission).toHaveBeenCalledTimes(1);
	});
});
