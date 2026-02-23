import { defineChecker } from "../core/define-checker";
import { commandOutput, writeIfPresent } from "../core/runtime";
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

export function extractFailureHighlights(output: string): string {
	const patterns = [
		/^\(fail\)/,
		/^FAIL\b/,
		/ tests failed/,
		/ test failed/,
		/^error: script/,
		/^Error:/,
		/^expect\(/,
		/^\s+at /,
	] as const;
	const lines = output.split(/\r?\n/);
	const ranges: Array<{ start: number; end: number }> = [];
	for (let index = 0; index < lines.length; index += 1) {
		const normalized = lines[index]?.trimStart() ?? "";
		if (!patterns.some((pattern) => pattern.test(normalized))) {
			continue;
		}
		ranges.push({
			start: Math.max(0, index - 3),
			end: Math.min(lines.length - 1, index + 8),
		});
	}
	if (ranges.length === 0) {
		return "";
	}
	const merged: Array<{ start: number; end: number }> = [];
	for (const range of ranges) {
		const last = merged[merged.length - 1];
		if (!last || range.start > last.end + 1) {
			merged.push(range);
			continue;
		}
		last.end = Math.max(last.end, range.end);
	}
	return merged
		.slice(0, 12)
		.map((range) => lines.slice(range.start, range.end + 1).join("\n"))
		.join("\n...\n");
}

export async function runAndEmit(
	ctx: CheckContext,
	spec: CommandSpec,
): Promise<CommandResult> {
	const result = await ctx.exec(spec);
	emitResult(result);
	return result;
}

const CHECK_PACKAGES = ["backend", "extension", "frontend"] as const;
type CheckPackage = (typeof CHECK_PACKAGES)[number];

export function createPackageScriptChecker(options: {
	id: string;
	retryCommand: string;
	prefix: "FORMAT" | "LINT";
	script: string;
	perPackageFailure: string;
	remediationLine: string;
	protocolLine: string;
	summaryLine: string;
	passLine: string;
}): Checker {
	return defineChecker({
		id: options.id,
		retryCommand: options.retryCommand,
		async run(ctx) {
			const failed: CheckPackage[] = [];
			for (const pkg of CHECK_PACKAGES) {
				const result = await ctx.exec({
					args: ["bun", "run", options.script],
					cwd: pkg,
				});
				if (result.exitCode === 0) {
					continue;
				}
				failed.push(pkg);
				console.error(`[${options.prefix}] FAIL: ${pkg} ${options.perPackageFailure}.`);
				console.error(
					`[${options.prefix}] --- ${pkg} ${options.id} log tail ---`,
				);
				console.error(ctx.tail(outputFor(result), 120));
				console.error(`[${options.prefix}] --- end ${pkg} ${options.id} log ---`);
				console.error(options.remediationLine);
			}
			if (failed.length > 0) {
				ctx.fail([
					`[${options.prefix}] Failed packages: ${failed.join(" ")}`,
					options.summaryLine,
					options.protocolLine,
				]);
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
