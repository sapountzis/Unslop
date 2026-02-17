#!/usr/bin/env bun
import { runPrCleanup } from "./commands/pr-cleanup";
import { runPrReady } from "./commands/pr-ready";
import { runPrSubmit } from "./commands/pr-submit";
import { runSetup } from "./commands/setup";
import { CHECK_USAGE, runCheckTarget } from "./core/check-runner";
import { CHECKS_ERROR, ChecksError } from "./core/errors";
import { GATE_USAGE, runGate } from "./core/checker-exec";
import { resolveRootDir, withCleanup } from "./core/runtime";

function printUsage(): void {
	console.error("Usage: bun run ./tools/checks/cli.ts <command> [args...]");
	console.error("Commands:");
	console.error("  setup");
	console.error(
		`  ${CHECK_USAGE.replace("Usage: bun run ./tools/checks/cli.ts ", "")}`,
	);
	console.error(
		`  ${GATE_USAGE.replace("Usage: bun run ./tools/checks/cli.ts ", "")}`,
	);
	console.error("  pr-ready");
	console.error("  pr-submit");
	console.error("  pr-cleanup");
}

const rootDir = resolveRootDir();
const [, , command, arg] = process.argv;

if (!command) {
	printUsage();
	process.exit(64);
}

try {
	switch (command) {
		case "setup":
			await withCleanup(rootDir, () => runSetup(rootDir));
			break;
		case "check": {
			const target = arg ?? "all";
			await withCleanup(rootDir, () => runCheckTarget(rootDir, target));
			break;
		}
		case "gate": {
			if (!arg) {
				throw new ChecksError("missing gate target", CHECKS_ERROR.usage, 64);
			}
			await withCleanup(rootDir, () => runGate(rootDir, arg));
			break;
		}
		case "pr-ready":
			await withCleanup(rootDir, () => runPrReady(rootDir));
			break;
		case "pr-submit":
			await withCleanup(rootDir, () => runPrSubmit(rootDir));
			break;
		case "pr-cleanup":
			await withCleanup(rootDir, () => runPrCleanup(rootDir));
			break;
		default:
			printUsage();
			process.exit(64);
	}
} catch (error) {
	if (error instanceof ChecksError && error.code === CHECKS_ERROR.usage) {
		printUsage();
		console.error(error.message);
		process.exit(error.exitCode);
	}
	if (
		error instanceof ChecksError &&
		error.code === CHECKS_ERROR.unknownTarget
	) {
		console.error(error.message);
		if (command === "gate") {
			console.error(GATE_USAGE);
		} else {
			console.error(CHECK_USAGE);
		}
		process.exit(error.exitCode);
	}
	if (error instanceof ChecksError) {
		if (error.message) {
			console.error(error.message);
		}
		process.exit(error.exitCode);
	}
	const message = (error as Error)?.message;
	if (message) {
		console.error(message);
	}
	process.exit(1);
}
