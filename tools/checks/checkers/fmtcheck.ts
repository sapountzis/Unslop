import { biomeMissingToolLines, createBiomeChecker } from "./shared";

export const fmtcheckChecker = createBiomeChecker({
	id: "fmtcheck",
	retryCommand: "make fmtcheck",
	args: ["format", "--reporter=summary", "."],
	missingToolLines: biomeMissingToolLines("FORMAT", "make fmtcheck"),
	failLines: [
		"[FORMAT] FAIL: one or more files are not formatted.",
		"[FORMAT] Remediation: run 'make fmt' to apply formatting changes.",
		"[FORMAT] Protocol: address the failure shown above, then re-run 'make fmtcheck' until it passes.",
	],
	passLine: "[FORMAT] PASS: formatting is compliant.",
});
