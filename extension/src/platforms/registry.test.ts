import { describe, expect, it } from "bun:test";
import {
	getHostname,
	isSupportedPlatformUrl,
	listSupportedPlatformHosts,
	resolveSupportedPlatformIdFromHost,
	resolveSupportedPlatformIdFromUrl,
} from "./registry";

describe("platform registry", () => {
	it("extracts hostnames safely", () => {
		expect(getHostname("https://www.linkedin.com/feed/")).toBe(
			"www.linkedin.com",
		);
		expect(getHostname("not-a-url")).toBeNull();
	});

	it("resolves supported platform ids from host and url", () => {
		expect(resolveSupportedPlatformIdFromHost("x.com")).toBe("x");
		expect(resolveSupportedPlatformIdFromUrl("https://old.reddit.com/")).toBe(
			"reddit",
		);
		expect(resolveSupportedPlatformIdFromUrl("https://example.com")).toBeNull();
	});

	it("reports whether a url belongs to a supported platform host", () => {
		expect(isSupportedPlatformUrl("https://twitter.com/home")).toBe(true);
		expect(isSupportedPlatformUrl("https://google.com")).toBe(false);
	});

	it("lists all supported hosts for diagnostics hints", () => {
		expect(listSupportedPlatformHosts()).toEqual([
			"www.linkedin.com",
			"x.com",
			"twitter.com",
			"www.reddit.com",
			"old.reddit.com",
		]);
	});
});
