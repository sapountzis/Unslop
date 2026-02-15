import { describe, expect, it } from "bun:test";
import { DEBUG_CONTENT_RUNTIME } from "../lib/config";

describe("debug flags", () => {
	it("keeps content runtime diagnostics disabled by default", () => {
		expect(DEBUG_CONTENT_RUNTIME).toBe(false);
	});
});
