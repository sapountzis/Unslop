import { createScriptChecker } from "./shared";

export const doclintChecker = createScriptChecker({
	id: "doclint",
	retryCommand: "make doclint",
	scriptPath: "./tools/checks/validators/doc_lint.ts",
	failLines: [
		"[DOCLINT] FAIL: documentation lint checks failed.",
		"[DOCLINT] Remediation: fix the listed doc issues (paths/links/frontmatter/freshness metadata) in the exact files reported above.",
		"[DOCLINT] Protocol: re-run 'make doclint' until it passes.",
	],
	passLine: "[DOCLINT] PASS: documentation lint checks are compliant.",
});
