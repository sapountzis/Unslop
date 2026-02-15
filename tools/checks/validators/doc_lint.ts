#!/usr/bin/env bun
import { existsSync } from "node:fs";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const DOCS = path.join(ROOT, "docs");
const PRODUCT_SPECS = path.join(DOCS, "product-specs");
const EXEC_ACTIVE = path.join(DOCS, "exec-plans", "active");
const FORBIDDEN_LEGACY_PATHS = ["spec", "docs/plans"];

const REQUIRED_PATHS = [
	"docs/index.md",
	"docs/core-beliefs.md",
	"docs/product-specs/README.md",
	"docs/product-specs/index.md",
	"docs/exec-plans/README.md",
	"docs/exec-plans/active",
	"docs/exec-plans/completed",
	"docs/decisions/README.md",
	"docs/quality/QUALITY_SCORE.md",
	"docs/quality/tech-debt.md",
	"docs/runbooks/README.md",
	"docs/runbooks/quality-review.md",
];

const VALID_STATUS = new Set(["draft", "verified", "deprecated"]);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const LEGACY_SPEC_REF_RE = /(^|[\s`(])(\.\.\/)?spec\//m;
const LEGACY_PLANS_REF_RE = /(^|[\s`(])docs\/plans\//m;
const MIGRATION_SCAN_FILES = [
	"AGENTS.md",
	"backend/AGENTS.md",
	"extension/AGENTS.md",
	"README.md",
	"ARCHITECTURE.md",
];

let errors = 0;
let warnings = 0;

type Violation = {
	rule: string;
	message: string;
	remediation: string;
};

type WarningNote = {
	rule: string;
	message: string;
};

const violations: Violation[] = [];
const warningNotes: WarningNote[] = [];

function err(rule: string, message: string, remediation: string) {
	errors += 1;
	violations.push({ rule, message, remediation });
}

function warn(rule: string, message: string) {
	warnings += 1;
	warningNotes.push({ rule, message });
}

function printGroupedViolations() {
	const grouped = new Map<string, Violation[]>();
	for (const violation of violations) {
		if (!grouped.has(violation.rule)) grouped.set(violation.rule, []);
		grouped.get(violation.rule)?.push(violation);
	}

	for (const [rule, items] of grouped.entries()) {
		console.error(`[DOCLINT] RULE ${rule}: ${items.length} issue(s)`);
		for (const item of items) {
			console.error(`[DOCLINT] ERROR: ${item.message}`);
			console.error(`[DOCLINT] Remediation: ${item.remediation}`);
		}
	}
}

function printWarnings() {
	const grouped = new Map<string, WarningNote[]>();
	for (const note of warningNotes) {
		if (!grouped.has(note.rule)) grouped.set(note.rule, []);
		grouped.get(note.rule)?.push(note);
	}

	for (const [rule, items] of grouped.entries()) {
		console.warn(`[DOCLINT] RULE ${rule}: ${items.length} warning(s)`);
		for (const item of items) {
			console.warn(`[DOCLINT] WARN: ${item.message}`);
		}
	}
}

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

async function walkMarkdown(dir: string): Promise<string[]> {
	const out: string[] = [];
	if (!existsSync(dir)) return out;
	const entries = await readdir(dir);
	for (const entry of entries) {
		const abs = path.join(dir, entry);
		const s = await stat(abs);
		if (s.isDirectory()) {
			out.push(...(await walkMarkdown(abs)));
			continue;
		}
		if (entry.endsWith(".md")) out.push(abs);
	}
	return out;
}

async function ensureRequiredPaths() {
	for (const rel of REQUIRED_PATHS) {
		const abs = path.join(ROOT, rel);
		if (!existsSync(abs)) {
			err(
				"required-paths",
				`missing required docs path: ${rel}`,
				`create ${rel} using the canonical structure in this repository prompt`,
			);
		}
	}
}

async function ensureLegacyPathsRemoved() {
	for (const rel of FORBIDDEN_LEGACY_PATHS) {
		const abs = path.join(ROOT, rel);
		if (existsSync(abs)) {
			err(
				"legacy-paths",
				`legacy path detected: ${rel}`,
				`move remaining content to docs/ target locations and delete ${rel}`,
			);
		}
	}
}

async function lintLegacySpecReferences() {
	const files: string[] = [];

	for (const rel of MIGRATION_SCAN_FILES) {
		const abs = path.join(ROOT, rel);
		if (existsSync(abs)) files.push(abs);
	}

	files.push(...(await walkMarkdown(path.join(ROOT, "docs"))));

	for (const abs of files) {
		const rel = path.relative(ROOT, abs);
		const raw = await readFile(abs, "utf8");

		if (LEGACY_SPEC_REF_RE.test(raw)) {
			err(
				"legacy-references",
				`${rel} references legacy spec paths`,
				`replace spec links with docs/product-specs/* links and remove legacy references`,
			);
		}

		if (LEGACY_PLANS_REF_RE.test(raw)) {
			err(
				"legacy-references",
				`${rel} references legacy docs/plans path`,
				`replace docs/plans references with docs/exec-plans/* paths`,
			);
		}
	}
}

async function lintProductSpecs() {
	if (!existsSync(PRODUCT_SPECS)) {
		err(
			"product-specs",
			"missing directory: docs/product-specs",
			"create docs/product-specs and move all product specs into it",
		);
		return;
	}

	const files = (await readdir(PRODUCT_SPECS))
		.filter((f) => f.endsWith(".md"))
		.filter((f) => f !== "README.md" && f !== "index.md");

	if (files.length === 0) {
		err(
			"product-specs",
			"docs/product-specs has no spec files to validate",
			"move migrated product spec files into docs/product-specs/*.md",
		);
		return;
	}

	for (const file of files) {
		const rel = `docs/product-specs/${file}`;
		const raw = await readFile(path.join(PRODUCT_SPECS, file), "utf8");
		const fm = parseFrontmatter(raw);
		if (!fm) {
			err(
				"product-spec-frontmatter",
				`${rel} missing YAML frontmatter block`,
				`add frontmatter with owner/status/last_verified to ${rel}`,
			);
			continue;
		}

		for (const field of ["owner", "status", "last_verified"]) {
			if (!fm[field]) {
				err(
					"product-spec-frontmatter",
					`${rel} missing frontmatter field '${field}'`,
					`add '${field}' in frontmatter for ${rel}`,
				);
			}
		}

		if (fm.status && !VALID_STATUS.has(fm.status)) {
			err(
				"product-spec-status",
				`${rel} has invalid status '${fm.status}'`,
				`use one of: draft, verified, deprecated`,
			);
		}

		if (fm.last_verified && !DATE_RE.test(fm.last_verified)) {
			err(
				"product-spec-last-verified",
				`${rel} has invalid last_verified date '${fm.last_verified}'`,
				`use YYYY-MM-DD format for last_verified`,
			);
		}

		if (fm.status === "verified" && DATE_RE.test(fm.last_verified ?? "")) {
			const ageDays = Math.floor(
				(Date.now() - Date.parse(fm.last_verified)) / (1000 * 60 * 60 * 24),
			);
			if (ageDays > 90) {
				warn(
					"product-spec-staleness",
					`${rel} is verified but stale (${ageDays} days since last_verified)`,
				);
			}
		}
	}
}

async function lintActivePlans() {
	if (!existsSync(EXEC_ACTIVE)) {
		err(
			"exec-plans-active-dir",
			"missing directory: docs/exec-plans/active",
			"create docs/exec-plans/active and place active execution plans there",
		);
		return;
	}

	const files = (await readdir(EXEC_ACTIVE)).filter((f) => f.endsWith(".md"));
	for (const file of files) {
		const rel = `docs/exec-plans/active/${file}`;
		const raw = await readFile(path.join(EXEC_ACTIVE, file), "utf8");
		const fm = parseFrontmatter(raw);
		if (!fm) {
			err(
				"exec-plan-frontmatter",
				`${rel} missing YAML frontmatter block`,
				`add frontmatter with owner/status/created to ${rel}`,
			);
			continue;
		}

		for (const field of ["owner", "status", "created"]) {
			if (!fm[field]) {
				err(
					"exec-plan-frontmatter",
					`${rel} missing frontmatter field '${field}'`,
					`add '${field}' to frontmatter for ${rel}`,
				);
			}
		}

		if (!raw.includes("docs/product-specs/")) {
			err(
				"exec-plan-spec-link",
				`${rel} must reference at least one docs/product-specs/* file`,
				`add a Spec link under Context pointing to docs/product-specs/<name>.md`,
			);
		}
	}
}

await ensureRequiredPaths();
await ensureLegacyPathsRemoved();
await lintLegacySpecReferences();
await lintProductSpecs();
await lintActivePlans();

if (errors > 0) {
	printGroupedViolations();
	if (warnings > 0) printWarnings();
	console.error(`[DOCLINT] FAIL: ${errors} error(s), ${warnings} warning(s)`);
	process.exit(1);
}

if (warnings > 0) printWarnings();
console.log(`[DOCLINT] PASS: 0 error(s), ${warnings} warning(s)`);
