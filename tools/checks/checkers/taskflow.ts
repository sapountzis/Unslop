import { createScriptChecker } from "./shared";

export const taskflowChecker = createScriptChecker({
	id: "taskflow",
	retryCommand: "make taskflow",
	scriptPath: "./tools/checks/validators/taskflow_check.ts",
	failLines: [
		"[TASKFLOW] FAIL: taskflow lifecycle checks failed.",
		"[TASKFLOW] Remediation: apply the action from the first [TASKFLOW] ERROR line (plan count/path, missing sections, placeholders, or loop evidence).",
		"[TASKFLOW] Hint: code changes must map to exactly one touched plan file with explicit edit -> make check -> review entries.",
		"[TASKFLOW] Protocol: re-run 'make taskflow' until it passes.",
	],
	passLine: "[TASKFLOW] PASS: taskflow lifecycle checks are compliant.",
});
