import { createPackageScriptChecker } from "./shared";

export const fmtcheckChecker = createPackageScriptChecker({
	id: "fmtcheck",
	retryCommand: "make fmtcheck",
	prefix: "FORMAT",
	script: "check:fmt:verify",
	perPackageFailure: "has unformatted files",
	remediationLine: "[FORMAT] Remediation: run 'make fmt' to apply formatting changes.",
	protocolLine:
		"[FORMAT] Protocol: address the failure shown above, then re-run 'make fmtcheck' until it passes.",
	summaryLine: "[FORMAT] FAIL: one or more files are not formatted.",
	passLine: "[FORMAT] PASS: formatting is compliant.",
});
