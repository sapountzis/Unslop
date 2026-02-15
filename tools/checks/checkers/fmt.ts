import { createPackageScriptChecker } from "./shared";

export const fmtChecker = createPackageScriptChecker({
	id: "fmt",
	retryCommand: "make fmt",
	prefix: "FORMAT",
	script: "check:fmt",
	perPackageFailure: "formatting failed",
	remediationLine: "[FORMAT] Remediation: address the diagnostics above, then retry.",
	protocolLine:
		"[FORMAT] Protocol: re-run 'make fmt' until it passes, then run 'make fmtcheck'.",
	summaryLine: "[FORMAT] FAIL: formatting could not be applied cleanly.",
	passLine:
		"[FORMAT] DONE: formatting applied. Re-run 'make check' before opening PR.",
});
