#!/usr/bin/env bun
import { existsSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const BRANCH_RE = /^(feat|fix|chore|docs|refactor)\/[a-z0-9][a-z0-9-]*$/;
const PLAN_PATH_RE = /^docs\/exec-plans\/active\/[^/]+\.md$/;
const PLACEHOLDER_RE = /<fill-[^>]+>/;
const LOOP_EVIDENCE_RE = /^- Iteration \d+:\s*.*make check.*review.*$/im;
const MAIN_BRANCHES = new Set(["main", "master"]);
const TRANSIENT_ARTIFACT_RE = [
	/^\.tmp-check\.[^/]+(?:\/.*)?$/,
	/^\.tmp-check-ui\.[^/]+(?:\/.*)?$/,
	/^\.tmp-setup\.[^/]+(?:\/.*)?$/,
	/^test-results(?:\/.*)?$/,
	/^playwright-report(?:\/.*)?$/,
];

type Violation = {
	message: string;
	evidence: string;
	remediation: string;
};

type WorkflowMarker = {
	schema: number;
	feature_slug: string;
	branch: string;
	worktree_path: string;
	plan_path: string;
	base_branch: string;
	initialized_at: string;
};

const violations: Violation[] = [];

function addViolation(message: string, evidence: string, remediation: string) {
	violations.push({ message, evidence, remediation });
}

function git(args: string[]): string {
	const proc = Bun.spawnSync(["git", ...args], {
		cwd: ROOT,
		stdout: "pipe",
		stderr: "pipe",
	});
	if (proc.exitCode !== 0) {
		const stderr = Buffer.from(proc.stderr).toString("utf8").trim();
		throw new Error(
			`git ${args.join(" ")} failed${stderr ? `: ${stderr}` : ""}`,
		);
	}
	return Buffer.from(proc.stdout).toString("utf8");
}

function normalizeStatusPath(rawPath: string): string {
	let p = rawPath.trim();
	if (p.includes(" -> ")) {
		const pieces = p.split(" -> ");
		p = pieces[pieces.length - 1];
	}

	if (p.startsWith('"') && p.endsWith('"')) {
		p = p.slice(1, -1).replaceAll('\\"', '"').replaceAll("\\\\", "\\");
	}

	return p;
}

function parseStatusPaths(raw: string): string[] {
	const out: string[] = [];
	for (const line of raw.split("\n")) {
		if (!line.trim()) continue;
		if (line.length < 4) continue;
		const p = normalizeStatusPath(line.slice(3));
		if (p) out.push(p);
	}
	return out;
}

function unique(items: string[]): string[] {
	return [...new Set(items)];
}

function isTransientArtifactPath(rel: string): boolean {
	return TRANSIENT_ARTIFACT_RE.some((re) => re.test(rel));
}

function isDocPath(rel: string): boolean {
	return rel.startsWith("docs/") || rel.endsWith(".md");
}

function getChangedFiles(): string[] {
	const porcelain = git(["status", "--porcelain"]);
	let changed = unique(parseStatusPaths(porcelain)).filter(
		(relPath) => !isTransientArtifactPath(relPath),
	);
	if (changed.length > 0) return changed;

	try {
		git(["rev-parse", "--verify", "HEAD~1"]);
		const delta = git(["diff", "--name-only", "HEAD~1..HEAD"]);
		changed = unique(
			delta
				.split("\n")
				.map((line) => line.trim())
				.filter((line) => line.length > 0)
				.filter((line) => !isTransientArtifactPath(line)),
		);
	} catch {
		return [];
	}

	return changed;
}

async function readWorkflowMarker(): Promise<WorkflowMarker | null> {
	const markerPath = git([
		"rev-parse",
		"--git-path",
		"unslop-workflow.json",
	]).trim();
	if (!markerPath || !existsSync(markerPath)) {
		addViolation(
			"workflow marker is missing",
			`expected marker path: ${markerPath || "(empty path)"}`,
			"run `make init-feature FEATURE=<slug>` in the primary checkout, then continue work from the created linked worktree",
		);
		return null;
	}

	try {
		const raw = await readFile(markerPath, "utf8");
		const parsed = JSON.parse(raw) as WorkflowMarker;
		if (!parsed.plan_path || !PLAN_PATH_RE.test(parsed.plan_path)) {
			addViolation(
				"workflow marker has invalid plan_path",
				`plan_path: ${parsed.plan_path ?? "(missing)"}`,
				"re-run `make init-feature FEATURE=<slug>` to regenerate the marker",
			);
			return null;
		}
		return parsed;
	} catch (error) {
		addViolation(
			"workflow marker is unreadable JSON",
			`marker path: ${markerPath}; error: ${(error as Error).message}`,
			"re-run `make init-feature FEATURE=<slug>` to regenerate a valid marker",
		);
		return null;
	}
}

async function validateLocalWorkflow(changedCodeFiles: string[]) {
	const gitMetaPath = path.join(ROOT, ".git");
	if (!existsSync(gitMetaPath)) {
		addViolation(
			"missing .git metadata in current directory",
			`cwd: ${ROOT}`,
			"run checks from a git worktree rooted at the repository",
		);
		return;
	}

	const gitMetaStat = statSync(gitMetaPath);
	if (gitMetaStat.isDirectory()) {
		addViolation(
			"code changes must be validated from a linked worktree, not the primary checkout",
			`current checkout has .git directory: ${gitMetaPath}`,
			"run `make init-feature FEATURE=<slug>`, cd into the created worktree, then rerun `make check`",
		);
	}

	const branch = git(["rev-parse", "--abbrev-ref", "HEAD"]).trim();
	if (branch === "HEAD") {
		addViolation(
			"detached HEAD is not allowed for feature implementation",
			`branch: ${branch}`,
			"create a feature worktree via `make init-feature FEATURE=<slug>`",
		);
		return;
	}

	if (MAIN_BRANCHES.has(branch)) {
		addViolation(
			"direct development on main/master is not allowed",
			`branch: ${branch}; changed code files: ${changedCodeFiles.join(", ")}`,
			"run `make init-feature FEATURE=<slug>` and continue implementation from the created feature branch",
		);
	}

	if (!BRANCH_RE.test(branch)) {
		addViolation(
			"branch name must follow workflow policy",
			`branch: ${branch}`,
			"use a branch like feat/<slug>, fix/<slug>, chore/<slug>, docs/<slug>, or refactor/<slug>",
		);
	}

	const marker = await readWorkflowMarker();
	if (!marker) return;

	if (marker.branch !== branch) {
		addViolation(
			"workflow marker branch does not match current branch",
			`marker.branch: ${marker.branch}; current branch: ${branch}`,
			"re-run `make init-feature FEATURE=<slug>` for this branch",
		);
	}

	if (marker.worktree_path !== ROOT) {
		addViolation(
			"workflow marker worktree path does not match current checkout",
			`marker.worktree_path: ${marker.worktree_path}; cwd: ${ROOT}`,
			"run checks from the worktree created by `make init-feature`",
		);
	}

	const activePlanAbs = path.join(ROOT, marker.plan_path);
	const completedPlanRel = marker.plan_path.replace(
		"docs/exec-plans/active/",
		"docs/exec-plans/completed/",
	);
	const completedPlanAbs = path.join(ROOT, completedPlanRel);

	let planAbs = activePlanAbs;
	let planRel = marker.plan_path;

	if (!existsSync(activePlanAbs) && existsSync(completedPlanAbs)) {
		planAbs = completedPlanAbs;
		planRel = completedPlanRel;
	}

	if (!existsSync(planAbs)) {
		addViolation(
			"workflow marker does not resolve to an active or completed plan",
			`expected plan paths: ${marker.plan_path} or ${completedPlanRel}`,
			"restore the plan file or re-run `make init-feature FEATURE=<slug>`",
		);
		return;
	}

	const planRaw = await readFile(planAbs, "utf8");
	if (PLACEHOLDER_RE.test(planRaw)) {
		addViolation(
			"workflow plan still has unresolved template placeholders",
			`plan path: ${planRel}`,
			"fill all <fill-...> placeholders before proceeding with code changes",
		);
	}

	if (!/^## Workflow$/m.test(planRaw) || !/^## Iteration Log$/m.test(planRaw)) {
		addViolation(
			"workflow plan must include Workflow and Iteration Log sections",
			`plan path: ${planRel}`,
			"update the plan template usage to keep both sections present",
		);
	}

	if (!LOOP_EVIDENCE_RE.test(planRaw)) {
		addViolation(
			"workflow plan must include at least one edit/check/review loop entry",
			`plan path: ${planRel}`,
			"add an Iteration Log entry that includes both 'make check' and 'review'",
		);
	}
}

const changedFiles = getChangedFiles();
if (changedFiles.length === 0) {
	console.log("[WORKFLOW] PASS: no changed files detected.");
	process.exit(0);
}

const changedCodeFiles = changedFiles.filter((file) => !isDocPath(file));
if (changedCodeFiles.length === 0) {
	console.log("[WORKFLOW] PASS: docs-only change set detected.");
	process.exit(0);
}

if (process.env.CI) {
	console.log(
		"[WORKFLOW] PASS: CI environment detected; skipping local linked-worktree enforcement.",
	);
	process.exit(0);
}

await validateLocalWorkflow(changedCodeFiles);

if (violations.length > 0) {
	for (const v of violations) {
		console.error(`[WORKFLOW] ERROR: ${v.message}`);
		console.error(`[WORKFLOW] Evidence: ${v.evidence}`);
		console.error(`[WORKFLOW] Remediation: ${v.remediation}`);
	}
	console.error(`[WORKFLOW] FAIL: ${violations.length} error(s)`);
	process.exit(1);
}

console.log("[WORKFLOW] PASS: local workflow checks are compliant.");
