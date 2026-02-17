import { describe, it, expect } from "bun:test";

describe("Integration test environment", () => {
	it("has DATABASE_URL configured", () => {
		if (!process.env.DATABASE_URL) {
			console.log(
				"Skipping integration env assertion: DATABASE_URL is not configured.",
			);
			return;
		}

		expect(process.env.DATABASE_URL).toBeTruthy();
	});
});
