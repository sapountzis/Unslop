import path from "node:path";
import { execGit } from "./process";
import { git } from "./workflow-marker";

export function runPrCleanup(rootDir: string): void {
	const branch = git(rootDir, ["rev-parse", "--abbrev-ref", "HEAD"]);
	const commonGitDir = git(rootDir, ["rev-parse", "--git-common-dir"]);
	const primaryPath = path.resolve(rootDir, commonGitDir, "..");
	const dryRun = process.env.DRY_RUN ?? "0";

	if (primaryPath === rootDir) {
		console.error(
			"[PR-CLEANUP] SKIP: current checkout is the primary worktree.",
		);
		console.error("[PR-CLEANUP] Action: no linked worktree removal performed.");
		return;
	}

	if (dryRun === "1") {
		console.error(
			"[PR-CLEANUP] DRY-RUN: would remove linked worktree and local branch.",
		);
		console.error(`[PR-CLEANUP] Primary:  ${primaryPath}`);
		console.error(`[PR-CLEANUP] Worktree: ${rootDir}`);
		console.error(`[PR-CLEANUP] Branch:   ${branch}`);
		return;
	}

	const removeWorktree = execGit(primaryPath, [
		"worktree",
		"remove",
		rootDir,
		"--force",
	]);
	if (removeWorktree.exitCode !== 0) {
		console.error(
			`[PR-CLEANUP] FAIL: unable to remove linked worktree '${rootDir}'.`,
		);
		console.error(
			`[PR-CLEANUP] Remediation: run 'git -C "${primaryPath}" worktree remove "${rootDir}" --force' manually, then retry 'make pr-cleanup'.`,
		);
		throw new Error("pr-cleanup failed");
	}

	const branchExists = execGit(primaryPath, [
		"show-ref",
		"--verify",
		"--quiet",
		`refs/heads/${branch}`,
	]);
	if (branchExists.exitCode === 0) {
		const deleteBranch = execGit(primaryPath, ["branch", "-D", branch]);
		if (deleteBranch.exitCode !== 0) {
			console.error(
				`[PR-CLEANUP] FAIL: linked worktree removed but local branch '${branch}' could not be deleted.`,
			);
			console.error(
				`[PR-CLEANUP] Remediation: run 'git -C "${primaryPath}" branch -D "${branch}"' manually.`,
			);
			throw new Error("pr-cleanup failed");
		}
	}

	const checkStillPresent = execGit(primaryPath, [
		"worktree",
		"list",
		"--porcelain",
	]);
	if (checkStillPresent.exitCode !== 0) {
		console.error(
			`[PR-CLEANUP] FAIL: unable to verify worktree removal${checkStillPresent.stderr ? `: ${checkStillPresent.stderr}` : "."}`,
		);
		throw new Error("pr-cleanup failed");
	}
	const listOutput = checkStillPresent.stdout;
	if (
		listOutput.split("\n").some((line) => line.trim() === `worktree ${rootDir}`)
	) {
		console.error(
			`[PR-CLEANUP] FAIL: worktree cleanup incomplete; '${rootDir}' is still registered.`,
		);
		throw new Error("pr-cleanup failed");
	}

	console.error("[PR-CLEANUP] PASS: linked worktree cleanup completed.");
	console.error(`[PR-CLEANUP] Worktree: ${rootDir}`);
	console.error(`[PR-CLEANUP] Branch: ${branch}`);
}
