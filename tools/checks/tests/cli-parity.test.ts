import { describe, expect, it } from "bun:test";

function runCli(args: string[]) {
	return Bun.spawnSync(["bun", "run", "./tools/checks/cli.ts", ...args], {
		cwd: process.cwd(),
		stdout: "pipe",
		stderr: "pipe",
		env: {
			...process.env,
			CI: "1",
		},
	});
}

describe("checker cli parity", () => {
	it("returns legacy-style unknown check target diagnostics", () => {
		const proc = runCli(["check", "unknown-gate"]);
		expect(proc.exitCode).toBe(64);
		const stderr = Buffer.from(proc.stderr).toString("utf8");
		expect(stderr).toContain("Unknown check target: unknown-gate");
		expect(stderr).toContain(
			"Usage: bun run ./tools/checks/cli.ts check [fmt|fmtcheck|lint|type|test|ui|doclint|archlint|workflow|taskflow|all]",
		);
	});

	it("returns legacy-style unknown gate diagnostics", () => {
		const proc = runCli(["gate", "unknown-gate"]);
		expect(proc.exitCode).toBe(64);
		const stderr = Buffer.from(proc.stderr).toString("utf8");
		expect(stderr).toContain("Unknown check target: unknown-gate");
		expect(stderr).toContain(
			"Usage: bun run ./tools/checks/cli.ts gate [fmt|fmtcheck|lint|type|test|ui|doclint|archlint|workflow|taskflow]",
		);
	});

	it("exposes the expected command surface in usage output", () => {
		const proc = runCli([]);
		expect(proc.exitCode).toBe(64);
		const stderr = Buffer.from(proc.stderr).toString("utf8");
		expect(stderr).toContain("Usage: bun run ./tools/checks/cli.ts <command>");
		expect(stderr).toContain("check [");
		expect(stderr).toContain("gate [");
		expect(stderr).toContain("pr-ready");
		expect(stderr).toContain("pr-submit");
		expect(stderr).toContain("pr-cleanup");
	});
});
