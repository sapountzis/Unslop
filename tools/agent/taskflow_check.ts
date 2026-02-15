#!/usr/bin/env bun
import { existsSync, readdirSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const PLAN_PATH_RE = /^docs\/exec-plans\/(active|completed)\/[^/]+\.md$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type Violation = {
	message: string;
	evidence: string;
	remediation: string;
};

const violations: Violation[] = [];

function parseFrontmatter(raw: string): Record<string, string> | null {
	const m = raw.match(/^---\n([\s\S]*?)\n---\n?/);
	if (!m) return null;
	const fm: Record<string, string> = {};
	for (const line of m[1].split("\n")) {
		const i = line.indexOf(":");
		if (i <= 0) continue;
		const key = line.slice(0, i).trim();
		const val = line.slice(i + 1).trim();
		fm[key] = val;
	}
	return fm;
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

function collectFilesRecursive(relDir: string): string[] {
	const absDir = path.join(ROOT, relDir);
	if (!existsSync(absDir)) return [];
	if (!statSync(absDir).isDirectory()) return [relDir.replace(/\/$/, "")];

	const out: string[] = [];
	const stack = [absDir];
	while (stack.length > 0) {
		const current = stack.pop();
		if (!current) continue;
		for (const entry of readdirSync(current, { withFileTypes: true })) {
			const absPath = path.join(current, entry.name);
			if (entry.isDirectory()) {
				stack.push(absPath);
				continue;
			}
			const rel = path.relative(ROOT, absPath).replaceAll("\\", "/");
			out.push(rel);
		}
	}

	return out;
}

function isDocPath(rel: string): boolean {
	return rel.startsWith("docs/") || rel.endsWith(".md");
}

function isPlanPath(rel: string): boolean {
	return PLAN_PATH_RE.test(rel);
}

function addViolation(message: string, evidence: string, remediation: string) {
	violations.push({ message, evidence, remediation });
}

function getChangedFiles(): string[] {
	const porcelain = git(["status", "--porcelain"]);
	let changed = unique(
		parseStatusPaths(porcelain).flatMap((relPath) =>
			collectFilesRecursive(relPath),
		),
	);
	if (changed.length > 0) return changed;

	// CI/worktree-clean fallback: inspect latest commit delta.
	try {
		git(["rev-parse", "--verify", "HEAD~1"]);
		const delta = git(["diff", "--name-only", "HEAD~1..HEAD"]);
		changed = unique(
			delta
				.split("\n")
				.map((line) => line.trim())
				.filter((line) => line.length > 0),
		);
	} catch {
		return [];
	}

	return changed;
}

async function validatePlan(planRelPath: string) {
	const abs = path.join(ROOT, planRelPath);
	if (!existsSync(abs)) {
		addViolation(
			"execution plan file is referenced in diff but missing on disk",
			`plan path: ${planRelPath}`,
			`restore or create ${planRelPath} and ensure it matches task lifecycle state`,
		);
		return;
	}

	const raw = await readFile(abs, "utf8");
	const fm = parseFrontmatter(raw);
	const isActive = planRelPath.startsWith("docs/exec-plans/active/");
	const isCompleted = planRelPath.startsWith("docs/exec-plans/completed/");

	if (isActive) {
		const blocker = raw.match(/^Human input needed:\s*(.+)\s*$/m);
		if (!blocker || blocker[1].trim().length === 0) {
			addViolation(
				"active plan requires explicit human blocker question",
				`active plan without 'Human input needed: <question>': ${planRelPath}`,
				"if work is complete, move plan to docs/exec-plans/completed/ with completed frontmatter; if blocked, add 'Human input needed: <exact question>'",
			);
		}
		return;
	}

	if (isCompleted) {
		if (!fm) {
			addViolation(
				"completed plan missing frontmatter",
				`plan path: ${planRelPath}`,
				"add frontmatter with status: completed and completed: YYYY-MM-DD",
			);
			return;
		}

		if (fm.status !== "completed") {
			addViolation(
				"completed plan must declare status: completed",
				`status is '${fm.status ?? "(missing)"}' in ${planRelPath}`,
				"set frontmatter status: completed",
			);
		}

		if (!fm.completed || !DATE_RE.test(fm.completed)) {
			addViolation(
				"completed plan must include completed: YYYY-MM-DD",
				`completed is '${fm.completed ?? "(missing)"}' in ${planRelPath}`,
				"set frontmatter completed: YYYY-MM-DD",
			);
		}
	}
}

const changedFiles = getChangedFiles();
if (changedFiles.length === 0) {
	console.log("[TASKFLOW] PASS: no changed files detected.");
	process.exit(0);
}

const changedCodeFiles = changedFiles.filter((file) => !isDocPath(file));
const touchedPlans = changedFiles.filter(isPlanPath);

if (changedCodeFiles.length === 0) {
	console.log("[TASKFLOW] PASS: docs-only change set detected.");
	process.exit(0);
}

if (touchedPlans.length !== 1) {
	addViolation(
		"code changes require exactly one touched execution plan file",
		`code files: ${changedCodeFiles.join(", ")}; plan files: ${touchedPlans.length > 0 ? touchedPlans.join(", ") : "(none)"}`,
		"update exactly one plan under docs/exec-plans/active/ or docs/exec-plans/completed/",
	);
} else {
	await validatePlan(touchedPlans[0]);
}

if (violations.length > 0) {
	for (const v of violations) {
		console.error(`[TASKFLOW] ERROR: ${v.message}`);
		console.error(`[TASKFLOW] Evidence: ${v.evidence}`);
		console.error(`[TASKFLOW] Remediation: ${v.remediation}`);
	}
	console.error(`[TASKFLOW] FAIL: ${violations.length} error(s)`);
	process.exit(1);
}

console.log(
	`[TASKFLOW] PASS: code changes mapped to plan '${touchedPlans[0]}'.`,
);
