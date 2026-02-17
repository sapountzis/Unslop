import { defineChecker } from "../core/define-checker";
import type { CheckContext } from "../core/types";
import { outputFor } from "./shared";

const TS_GO_COMPAT_RE =
	/(panic:|internal compiler error|not yet implemented|unknown compiler option|failed to parse tsconfig|module resolution mode .* not supported)/i;
type Engine = "tsgo" | "tsc";

async function runComponent(
	ctx: CheckContext,
	component: "backend" | "extension",
	engine: Engine,
): Promise<{ ok: boolean; log: string }> {
	const runTsc = () =>
		ctx.exec({
			args: ["bunx", "tsc", "--noEmit", "-p", "tsconfig.json"],
			cwd: component,
		});
	if (engine === "tsc") {
		const result = await runTsc();
		return { ok: result.exitCode === 0, log: outputFor(result) };
	}
	const tsgoAvailable =
		(await ctx.exec({ args: ["bunx", "tsgo", "--version"], cwd: component }))
			.exitCode === 0;
	if (!tsgoAvailable) {
		const fallback = await runTsc();
		return {
			ok: fallback.exitCode === 0,
			log: [
				`[TYPE] WARN: tsgo is unavailable; falling back to tsc for ${component}.`,
				outputFor(fallback),
			].join("\n"),
		};
	}

	const tsgo = await ctx.exec({
		args: ["bunx", "tsgo", "--noEmit", "-p", "tsconfig.json"],
		cwd: component,
	});
	if (tsgo.exitCode === 0) return { ok: true, log: outputFor(tsgo) };
	const tsgoLog = outputFor(tsgo);
	if (TS_GO_COMPAT_RE.test(tsgoLog)) {
		const fallback = await runTsc();
		return {
			ok: fallback.exitCode === 0,
			log: [
				`[TYPE] WARN: tsgo compatibility gap detected for ${component}; falling back to tsc.`,
				ctx.tail(tsgoLog, 60),
				outputFor(fallback),
			].join("\n"),
		};
	}
	return {
		ok: false,
		log: [
			`[TYPE] FAIL: ${component} type-check failed under tsgo.`,
			ctx.tail(tsgoLog, 200),
		].join("\n"),
	};
}

export const typeChecker = defineChecker({
	id: "type",
	retryCommand: "make type",
	async run(ctx) {
		const rawEngine = process.env.TYPECHECK_ENGINE;
		const engine: Engine | "invalid" =
			rawEngine === "tsc"
				? "tsc"
				: !rawEngine || rawEngine === "auto" || rawEngine === "tsgo"
					? "tsgo"
					: "invalid";
		if (engine === "invalid") {
			ctx.fail([
				"[TYPE] FAIL: TYPECHECK_ENGINE must be one of: auto, tsgo, tsc.",
			]);
		}
		const failed: string[] = [];

		for (const component of ["backend", "extension"] as const) {
			const checked = await runComponent(ctx, component, engine);
			if (checked.ok) continue;
			failed.push(component);
			console.error(`[TYPE] FAIL: ${component} type-check failed.`);
			console.error(`[TYPE] --- ${component} type log tail ---`);
			console.error(ctx.tail(checked.log, 120));
			console.error(`[TYPE] --- end ${component} type log ---`);
			console.error(`[TYPE] Remediation: fix ${component} TypeScript errors.`);
		}
		if (failed.length > 0) {
			ctx.fail([
				`[TYPE] Failed components: ${failed.join(" ")}`,
				`[TYPE] FAIL: ${failed.length} type gate(s) failed.`,
				"[TYPE] Protocol: re-run 'make type' until it passes.",
			]);
		}
		console.log(
			`[TYPE] PASS: type checks compliant (engine: ${engine}).`,
		);
	},
});
