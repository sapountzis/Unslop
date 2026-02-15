import { biomeMissingToolLines, createBiomeChecker } from "./shared";

export const fmtChecker = createBiomeChecker({
	id: "fmt",
	retryCommand: "make fmt",
	args: ["format", "--write", "."],
	missingToolLines: biomeMissingToolLines("FORMAT", "make fmt"),
	failLines: [
		"[FORMAT] FAIL: Biome could not apply formatting changes.",
		"[FORMAT] Remediation: address the diagnostics above, then retry.",
		"[FORMAT] Protocol: re-run 'make fmt' until it passes, then run 'make fmtcheck'.",
	],
	passLine:
		"[FORMAT] DONE: formatting applied. Re-run 'make check' before opening PR.",
});
