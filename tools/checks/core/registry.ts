import { CHECKERS, CHECK_ORDER_ALL } from "../checkers";
import { CHECKS_ERROR, ChecksError } from "./errors";
import type { Checker } from "./types";

const checkerById = new Map<string, Checker>();
for (const checker of CHECKERS) {
	if (checkerById.has(checker.id)) {
		throw new Error(`duplicate checker id: ${checker.id}`);
	}
	checkerById.set(checker.id, checker);
}

for (const id of CHECK_ORDER_ALL) {
	if (!checkerById.has(id)) {
		throw new Error(`check order references unknown checker '${id}'`);
	}
}

export function getChecker(id: string): Checker | null {
	return checkerById.get(id) ?? null;
}

export function listCheckers(): Checker[] {
	return [...CHECKERS];
}

export function listCheckerIds(): string[] {
	return CHECKERS.map((checker) => checker.id);
}

export function listAllOrder(): string[] {
	return [...CHECK_ORDER_ALL];
}

export function formatCheckUsage(): string {
	const ids = listCheckerIds();
	return `Usage: bun run ./tools/checks/cli.ts check [${ids.join("|")}|all]`;
}

export function formatGateUsage(): string {
	const ids = listCheckerIds();
	return `Usage: bun run ./tools/checks/cli.ts gate [${ids.join("|")}]`;
}

function unknownTargetError(target: string): never {
	throw new ChecksError(
		`Unknown check target: ${target}`,
		CHECKS_ERROR.unknownTarget,
		64,
	);
}

export function resolveExecutionOrder(target: string): string[] {
	if (target === "all") {
		return listAllOrder();
	}
	if (!checkerById.has(target)) {
		unknownTargetError(target);
	}
	return [target];
}

export function requireChecker(id: string): Checker {
	const checker = getChecker(id);
	if (!checker) {
		unknownTargetError(id);
	}
	return checker;
}
