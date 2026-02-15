import { biomeMissingToolLines, createBiomeChecker } from "./shared";

export const lintChecker = createBiomeChecker({
	id: "lint",
	retryCommand: "make lint",
	args: ["lint", "--reporter=summary", "."],
	missingToolLines: biomeMissingToolLines("LINT", "make lint"),
	failLines: [
		"[LINT] FAIL: Biome lint checks failed.",
		"[LINT] Remediation: address the Biome diagnostics shown above.",
		"[LINT] Protocol: re-run 'make lint' until it passes.",
	],
	passLine: "[LINT] PASS: lint checks are compliant.",
});
