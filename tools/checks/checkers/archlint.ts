import { createScriptChecker } from "./shared";

export const archlintChecker = createScriptChecker({
	id: "archlint",
	retryCommand: "make archlint",
	scriptPath: "./tools/checks/validators/arch_lint.ts",
	failLines: [
		"[ARCHLINT] FAIL: architecture lint checks failed.",
		"[ARCHLINT] Remediation: fix the reported dependency-direction violations and move imports/modules to satisfy ARCHITECTURE.md layering rules.",
		"[ARCHLINT] Protocol: re-run 'make archlint' until it passes.",
	],
	passLine: "[ARCHLINT] PASS: architecture lint checks are compliant.",
});
