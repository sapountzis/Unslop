import { describe, expect, it } from "bun:test";
import { defineChecker } from "../core/define-checker";
import { runCommand } from "../core/runtime";

describe("checker contract", () => {
	it("rejects invalid checker ids", () => {
		expect(() =>
			defineChecker({
				id: "Bad_ID",
				retryCommand: "make lint",
				run: () => {},
			}),
		).toThrow("invalid id");
	});

	it("rejects retry commands that are not make targets", () => {
		expect(() =>
			defineChecker({
				id: "lint",
				retryCommand: "bun run lint",
				run: () => {},
			}),
		).toThrow("invalid retryCommand");
	});

	it("marks command execution as timed out and returns promptly", async () => {
		const startedAt = Date.now();
		const result = await runCommand(
			{
				args: ["bash", "-lc", "sleep 2"],
				timeoutMs: 25,
			},
			process.cwd(),
		);
		expect(result.timedOut).toBe(true);
		expect(Date.now() - startedAt).toBeLessThan(1000);
	});

	it("keeps core authored checkers under a single global readability budget", async () => {
		const files = [
			"tools/checks/checkers/type.ts",
			"tools/checks/checkers/ui.ts",
			"tools/checks/checkers/test.ts",
		];
		let total = 0;
		for (const file of files) {
			const raw = await Bun.file(file).text();
			total += raw.trimEnd().split(/\r?\n/).length;
		}
		expect(total).toBeLessThanOrEqual(300);
	});
});
