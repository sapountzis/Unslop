import { describe, expect, it } from "bun:test";
import { resolveEnabled, toggleEnabled } from "./enabled-state";

describe("enabled-state", () => {
	it("treats missing enabled as true", () => {
		expect(resolveEnabled(undefined)).toBe(true);
		expect(resolveEnabled(null)).toBe(true);
	});

	it("toggles true to false and false to true", () => {
		expect(toggleEnabled(true)).toBe(false);
		expect(toggleEnabled(false)).toBe(true);
	});

	it("returns checked=true semantics when enabled is missing", () => {
		expect(resolveEnabled(undefined)).toBe(true);
	});
});
