import { describe, expect, it } from "bun:test";
import { resolveDevMode, toggleDevMode } from "./dev-mode";

describe("dev-mode", () => {
	it("keeps developer mode disabled when setting is missing", () => {
		expect(resolveDevMode(undefined)).toBe(false);
		expect(resolveDevMode(null)).toBe(false);
	});

	it("accepts only explicit true as enabled", () => {
		expect(resolveDevMode(true)).toBe(true);
		expect(resolveDevMode(false)).toBe(false);
	});

	it("toggles developer mode state", () => {
		expect(toggleDevMode(true)).toBe(false);
		expect(toggleDevMode(false)).toBe(true);
		expect(toggleDevMode(undefined)).toBe(true);
	});
});
