import path from "node:path";
import { defineChecker } from "../core/define-checker";
import { commandOutput, isExecutable, writeIfPresent } from "../core/runtime";
import type {
	CheckContext,
	Checker,
	CommandResult,
	CommandSpec,
} from "../core/types";

export function emitResult(result: CommandResult): void {
	writeIfPresent(result.stdout);
	writeIfPresent(result.stderr, "stderr");
}

export function outputFor(result: CommandResult): string {
	return commandOutput(result);
}

export async function runAndEmit(
	ctx: CheckContext,
	spec: CommandSpec,
): Promise<CommandResult> {
	const result = await ctx.exec(spec);
	emitResult(result);
	return result;
}

export function biomeMissingToolLines(
	prefix: "FORMAT" | "LINT",
	retryCommand: string,
): string[] {
	return [
		`[${prefix}] FAIL: Biome is not installed at './node_modules/.bin/biome'.`,
		`[${prefix}] Remediation: run 'make setup' to install local tooling dependencies.`,
		`[${prefix}] Protocol: run 'make setup', then re-run '${retryCommand}' until it passes.`,
	];
}

export function createBiomeChecker(options: {
	id: string;
	retryCommand: string;
	args: string[];
	missingToolLines: string[];
	failLines: string[];
	passLine: string;
}): Checker {
	return defineChecker({
		id: options.id,
		retryCommand: options.retryCommand,
		async run(ctx) {
			const biomePath = path.join(
				process.cwd(),
				"node_modules",
				".bin",
				"biome",
			);
			if (!isExecutable(biomePath)) {
				ctx.fail(options.missingToolLines);
			}
			const result = await runAndEmit(ctx, {
				args: ["./node_modules/.bin/biome", ...options.args],
			});
			if (result.exitCode !== 0) {
				ctx.fail(options.failLines);
			}
			console.log(options.passLine);
		},
	});
}

export function createScriptChecker(options: {
	id: string;
	retryCommand: string;
	scriptPath: string;
	failLines: string[];
	passLine: string;
}): Checker {
	return defineChecker({
		id: options.id,
		retryCommand: options.retryCommand,
		async run(ctx) {
			const result = await runAndEmit(ctx, {
				args: ["bun", "run", options.scriptPath],
			});
			if (result.exitCode !== 0) {
				ctx.fail(options.failLines);
			}
			console.log(options.passLine);
		},
	});
}
