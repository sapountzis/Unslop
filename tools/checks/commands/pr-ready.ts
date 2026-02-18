import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { exec, execGit } from "./process";
import { git, readWorkflowMarker } from "./workflow-marker";

const CHANGELOG_PATHS = new Set(["CHANGELOG.md"]);

function fail(message: string): never {
	console.error(message);
	throw new Error("pr-ready failed");
}

function isDocPath(rel: string): boolean {
	return rel.startsWith("docs/") || rel.endsWith(".md");
}

function resolveBaseRef(rootDir: string, baseBranch: string): string {
	const remoteCandidate = `origin/${baseBranch}`;
	const hasRemote = execGit(rootDir, ["rev-parse", "--verify", remoteCandidate]);
	if (hasRemote.exitCode === 0) {
		return remoteCandidate;
	}

	const hasLocal = execGit(rootDir, ["rev-parse", "--verify", baseBranch]);
	if (hasLocal.exitCode === 0) {
		return baseBranch;
	}

	fail(
		`[PR-READY] FAIL: unable to resolve base branch '${baseBranch}' locally or on origin.`,
	);
}

function enforceChangelogUpdate(
	rootDir: string,
	branch: string,
	baseBranch: string,
): void {
	const baseRef = resolveBaseRef(rootDir, baseBranch);
	const changed = execGit(rootDir, ["diff", "--name-only", `${baseRef}...${branch}`]);
	if (changed.exitCode !== 0) {
		fail(
			`[PR-READY] FAIL: unable to inspect branch diff against '${baseRef}'${changed.stderr ? `: ${changed.stderr}` : "."}`,
		);
	}

	const changedFiles = changed.stdout
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line.length > 0);
	const changedCodeFiles = changedFiles.filter((file) => !isDocPath(file));
	if (changedCodeFiles.length === 0) {
		return;
	}

	const touchedChangelog = changedFiles.some((file) => CHANGELOG_PATHS.has(file));
	if (!touchedChangelog) {
		console.error(
			"[PR-READY] FAIL: non-doc changes detected without a changelog update.",
		);
		fail(
			"[PR-READY] Remediation: update CHANGELOG.md (Keep a Changelog format), commit it, then rerun make pr-ready.",
		);
	}
}

export function runPrReady(rootDir: string): void {
	const branch = git(rootDir, ["rev-parse", "--abbrev-ref", "HEAD"]);

	if (branch === "HEAD") {
		fail("[PR-READY] FAIL: detached HEAD is not supported for PR submission.");
	}

	if (/^(main|master)$/.test(branch)) {
		console.error(
			`[PR-READY] FAIL: branch '${branch}' cannot be submitted directly.`,
		);
		fail(
			"[PR-READY] Remediation: run make init-feature FEATURE=<slug> and work from a feature branch.",
		);
	}

	const hasUnstaged = execGit(rootDir, ["diff", "--quiet"]);
	if (hasUnstaged.exitCode > 1) {
		fail(
			`[PR-READY] FAIL: unable to evaluate unstaged changes${hasUnstaged.stderr ? `: ${hasUnstaged.stderr}` : "."}`,
		);
	}
	const hasStaged = execGit(rootDir, ["diff", "--cached", "--quiet"]);
	if (hasStaged.exitCode > 1) {
		fail(
			`[PR-READY] FAIL: unable to evaluate staged changes${hasStaged.stderr ? `: ${hasStaged.stderr}` : "."}`,
		);
	}
	if (hasUnstaged.exitCode === 1 || hasStaged.exitCode === 1) {
		console.error(
			"[PR-READY] FAIL: working tree has unstaged or staged changes.",
		);
		fail(
			"[PR-READY] Remediation: commit changes before running make pr-ready.",
		);
	}

	const untracked = git(rootDir, [
		"ls-files",
		"--others",
		"--exclude-standard",
	]);
	if (untracked.trim().length > 0) {
		console.error("[PR-READY] FAIL: untracked files detected.");
		fail(
			"[PR-READY] Remediation: commit, move, or remove untracked files before submitting a PR.",
		);
	}

	let markerPath = "";
	let planPath = "";
	let baseBranch = "main";
	try {
		const markerData = readWorkflowMarker(rootDir);
		markerPath = markerData.markerPath;
		planPath = markerData.marker.plan_path;
		baseBranch = markerData.marker.base_branch || baseBranch;
	} catch (error) {
		console.error(`[PR-READY] FAIL: ${(error as Error).message}`);
		fail(
			"[PR-READY] Remediation: initialize with make init-feature FEATURE=<slug>.",
		);
	}

	if (!markerPath || !existsSync(markerPath)) {
		console.error(`[PR-READY] FAIL: missing workflow marker: ${markerPath}`);
		fail(
			"[PR-READY] Remediation: initialize with make init-feature FEATURE=<slug>.",
		);
	}

	if (!planPath) {
		fail("[PR-READY] FAIL: could not resolve plan_path from workflow marker.");
	}

	const activePlanAbs = path.join(rootDir, planPath);
	const completedPlanRel = planPath.replace(
		"docs/exec-plans/active",
		"docs/exec-plans/completed",
	);
	const completedPlanAbs = path.join(rootDir, completedPlanRel);

	if (existsSync(activePlanAbs)) {
		console.error(`[PR-READY] FAIL: active plan still present: ${planPath}`);
		fail(
			"[PR-READY] Remediation: finalize lifecycle (status: completed + completed date) and move to completed/.",
		);
	}

	if (!existsSync(completedPlanAbs)) {
		console.error(
			`[PR-READY] FAIL: completed plan not found: ${completedPlanRel}`,
		);
		fail(
			"[PR-READY] Remediation: move finalized plan into docs/exec-plans/completed/.",
		);
	}

	const completedRaw = readFileSync(completedPlanAbs, "utf8");
	if (!/^status:[\t ]*completed$/m.test(completedRaw)) {
		fail(
			"[PR-READY] FAIL: completed plan frontmatter missing status: completed.",
		);
	}

	if (!/^completed:[\t ]*[0-9]{4}-[0-9]{2}-[0-9]{2}$/m.test(completedRaw)) {
		fail(
			"[PR-READY] FAIL: completed plan frontmatter missing completed: YYYY-MM-DD.",
		);
	}

	if (/<fill-[^>]+>/.test(completedRaw)) {
		fail(
			"[PR-READY] FAIL: completed plan still has unresolved template placeholders.",
		);
	}

	if (!/^- PR:[\t ]*.+$/m.test(completedRaw)) {
		fail("[PR-READY] FAIL: completed plan must include a PR line under ## PR.");
	}

	enforceChangelogUpdate(rootDir, branch, baseBranch);

	console.log("[PR-READY] running make check to verify final readiness...");
	const check = exec(["make", "check"], rootDir, {
		stdio: "inherit",
		env: process.env,
	});
	if (check.exitCode !== 0) {
		throw new Error("pr-ready failed");
	}

	console.log("[PR-READY] PASS: branch is PR-ready.");
	console.log(`[PR-READY] Completed plan: ${completedPlanRel}`);
}
