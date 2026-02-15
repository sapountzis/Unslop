import { createScriptChecker } from "./shared";

export const workflowChecker = createScriptChecker({
	id: "workflow",
	retryCommand: "make workflow",
	scriptPath: "./tools/checks/validators/workflow_check.ts",
	failLines: [
		"[WORKFLOW] FAIL: workflow checks failed.",
		"[WORKFLOW] Remediation: apply the specific action from the first [WORKFLOW] ERROR line (marker, branch/worktree state, or plan linkage).",
		"[WORKFLOW] Hint: if initialization state is missing, re-run 'make init-feature FEATURE=<task-slug>' from the primary checkout.",
		"[WORKFLOW] Protocol: re-run 'make workflow' until it passes.",
	],
	passLine: "[WORKFLOW] PASS: workflow checks are compliant.",
});
