import { defineChecker } from "../core/define-checker";
import { extractFailureHighlights, outputFor } from "./shared";

const SUITES = [
	{
		id: "backend",
		label: "backend tests failed",
		spec: { args: ["bun", "run", "test"], cwd: "backend" },
		remediation: "[TEST] Remediation: fix failing backend tests shown above.",
	},
	{
		id: "extension",
		label: "extension tests failed",
		spec: { args: ["bun", "test", "src/"], cwd: "extension" },
		remediation: "[TEST] Remediation: fix failing extension tests shown above.",
	},
	{
		id: "checks-parity",
		label: "checker parity tests failed",
		spec: { args: ["bun", "test", "tools/checks/tests"] },
		remediation:
			"[TEST] Remediation: restore checker parity expectations or update parity tests for intentional behavior changes.",
	},
] as const;

export const testChecker = defineChecker({
	id: "test",
	retryCommand: "make test",
	async run(ctx) {
		const failed: string[] = [];
		for (const suite of SUITES) {
			const result = await ctx.exec(suite.spec);
			if (result.exitCode === 0) {
				continue;
			}
			const output = outputFor(result);
			failed.push(suite.id);
			console.error(`[TEST] FAIL: ${suite.label}.`);
			const highlights = extractFailureHighlights(output);
			if (highlights) {
				console.error(`[TEST] --- ${suite.id} extracted failures ---`);
				console.error(highlights);
				console.error(`[TEST] --- end extracted failures ---`);
			}
			console.error(`[TEST] --- ${suite.id} test log tail ---`);
			console.error(ctx.tail(output, 400));
			console.error(`[TEST] --- end ${suite.id} test log ---`);
			console.error(suite.remediation);
		}
		if (failed.length > 0) {
			ctx.fail([
				`[TEST] Failed suites: ${failed.join(" ")}`,
				`[TEST] FAIL: ${failed.length} test suite(s) failed.`,
				"[TEST] Protocol: re-run 'make test' until it passes.",
			]);
		}
		console.log("[TEST] PASS: test suites are compliant.");
	},
});
