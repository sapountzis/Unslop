import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { exec, execGh, execGit } from "./process";
import { runPrCleanup } from "./pr-cleanup";
import { runPrReady } from "./pr-ready";
import { readWorkflowMarker } from "./workflow-marker";

function fail(message: string): never {
	console.error(message);
	throw new Error("pr-submit failed");
}

function extractVerificationSection(rawPlan: string): string {
	const lines = rawPlan.split(/\r?\n/);
	const output: string[] = [];
	let inSection = false;
	for (const line of lines) {
		if (/^## Verification\s*$/.test(line)) {
			inSection = true;
			continue;
		}
		if (inSection && /^##\s+/.test(line)) {
			break;
		}
		if (inSection) {
			output.push(line);
		}
	}
	return output.join("\n").trimEnd();
}

function extractSpecLines(rawPlan: string): string[] {
	return rawPlan
		.split(/\r?\n/)
		.filter((line) => line.startsWith("- Spec: "))
		.map((line) => line.replace(/^- /, "- "));
}

export function runPrSubmit(rootDir: string): void {
	const baseBranch = process.env.BASE ?? "main";
	const autoCleanup = process.env.AUTO_CLEANUP ?? "1";

	runPrReady(rootDir);

	const ghVersion = exec(["gh", "--version"], rootDir);
	if (ghVersion.exitCode !== 0) {
		fail("[PR-SUBMIT] FAIL: GitHub CLI (gh) is required.");
	}

	const authStatus = execGh(rootDir, ["auth", "status"]);
	if (authStatus.exitCode !== 0) {
		console.error("[PR-SUBMIT] FAIL: gh is not authenticated.");
		fail("[PR-SUBMIT] Remediation: run 'gh auth login' and retry.");
	}

	const branchResult = execGit(rootDir, ["rev-parse", "--abbrev-ref", "HEAD"]);
	if (branchResult.exitCode !== 0) {
		fail(
			`[PR-SUBMIT] FAIL: unable to detect current branch${branchResult.stderr ? `: ${branchResult.stderr}` : "."}`,
		);
	}
	const branch = branchResult.stdout.trim();
	if (!branch) {
		fail("[PR-SUBMIT] FAIL: current branch name is empty.");
	}

	console.log(`[PR-SUBMIT] syncing branch '${branch}' to origin...`);
	const push = exec(
		["git", "-C", rootDir, "push", "-u", "origin", branch],
		rootDir,
		{
			stdio: "inherit",
			env: process.env,
		},
	);
	if (push.exitCode !== 0) {
		console.error(
			`[PR-SUBMIT] FAIL: unable to push branch '${branch}' to origin.`,
		);
		fail(
			"[PR-SUBMIT] Remediation: resolve git push errors, then re-run 'make pr-submit'.",
		);
	}

	const existingPr = execGh(rootDir, ["pr", "view", "--json", "url"]);
	if (existingPr.exitCode === 0) {
		let url = "unknown";
		try {
			const parsed = JSON.parse(existingPr.stdout) as { url?: string };
			if (parsed.url) {
				url = parsed.url;
			}
		} catch {
			// Preserve flow even if gh output is not parseable JSON.
		}
		console.error(
			`[PR-SUBMIT] PASS: PR already exists for branch '${branch}': ${url}`,
		);
		if (autoCleanup === "1") {
			runPrCleanup(rootDir);
		}
		return;
	}

	const markerData = readWorkflowMarker(rootDir);
	const activePlanRel = markerData.marker.plan_path;
	const completedPlanRel = activePlanRel.replace(
		"docs/exec-plans/active",
		"docs/exec-plans/completed",
	);
	const completedPlanAbs = path.join(rootDir, completedPlanRel);
	const completedPlanRaw = readFileSync(completedPlanAbs, "utf8");

	const titleResult = execGit(rootDir, ["log", "-1", "--pretty=%s"]);
	if (titleResult.exitCode !== 0 && !process.env.PR_TITLE) {
		fail(
			`[PR-SUBMIT] FAIL: unable to resolve PR title from latest commit${titleResult.stderr ? `: ${titleResult.stderr}` : "."}`,
		);
	}
	const title = process.env.PR_TITLE ?? titleResult.stdout.trim();

	const tmpDir = mkdtempSync(path.join(rootDir, ".tmp-pr-body."));
	try {
		const bodyFile = path.join(tmpDir, "body.md");
		const specLines = extractSpecLines(completedPlanRaw);
		const verificationSection = extractVerificationSection(completedPlanRaw);

		writeFileSync(
			bodyFile,
			[
				"## Summary",
				`- Complete ${branch} delivery flow with worktree + plan lifecycle enforcement.`,
				"",
				"## Governing Specs",
				...(specLines.length > 0 ? specLines : ["- (none)"]),
				"",
				"## Execution Plan",
				`- ${completedPlanRel}`,
				"",
				"## Verification",
				verificationSection,
				"",
			].join("\n"),
			"utf8",
		);

		const created = execGh(rootDir, [
			"pr",
			"create",
			"--base",
			baseBranch,
			"--head",
			branch,
			"--title",
			title,
			"--body-file",
			bodyFile,
		]);

		if (created.exitCode !== 0) {
			if (created.stderr) {
				process.stderr.write(
					created.stderr.endsWith("\n")
						? created.stderr
						: `${created.stderr}\n`,
				);
			}
			throw new Error("pr-submit failed");
		}

		const url = created.stdout.trim();
		console.log(`[PR-SUBMIT] PASS: PR created: ${url}`);

		if (autoCleanup === "1") {
			runPrCleanup(rootDir);
		}
	} finally {
		rmSync(tmpDir, { recursive: true, force: true });
	}
}
