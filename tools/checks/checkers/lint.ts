import { createPackageScriptChecker } from "./shared";

export const lintChecker = createPackageScriptChecker({
	id: "lint",
	retryCommand: "make lint",
	prefix: "LINT",
	script: "check:lint",
	perPackageFailure: "lint checks failed",
	remediationLine: "[LINT] Remediation: address the diagnostics shown above.",
	protocolLine: "[LINT] Protocol: re-run 'make lint' until it passes.",
	summaryLine: "[LINT] FAIL: lint checks failed.",
	passLine: "[LINT] PASS: lint checks are compliant.",
});
