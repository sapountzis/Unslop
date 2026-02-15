import type { Checker } from "./types";

const CHECKER_ID_RE = /^[a-z][a-z0-9-]*$/;

export function defineChecker(checker: Checker): Checker {
	if (!checker.id) {
		throw new Error("checker.id is required");
	}
	if (!CHECKER_ID_RE.test(checker.id)) {
		throw new Error(
			`checker '${checker.id}' has invalid id; use lower-case kebab-case`,
		);
	}
	if (typeof checker.run !== "function") {
		throw new Error(`checker '${checker.id}' is missing run()`);
	}
	if (!checker.retryCommand) {
		throw new Error(`checker '${checker.id}' is missing retryCommand`);
	}
	if (!checker.retryCommand.startsWith("make ")) {
		throw new Error(
			`checker '${checker.id}' has invalid retryCommand '${checker.retryCommand}'; expected make target`,
		);
	}
	return checker;
}
