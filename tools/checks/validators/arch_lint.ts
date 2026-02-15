#!/usr/bin/env bun
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

type Violation = {
	file: string;
	importPath: string;
	reason: string;
	fix: string;
};

const ROOT = process.cwd();
const violations: Violation[] = [];

const IMPORT_RE = /import\s+[^'"\n]*from\s+['"]([^'"]+)['"]/g;

const BACKEND_DIR = path.join(ROOT, "backend", "src");
const EXT_DIR = path.join(ROOT, "extension", "src");

function normalize(p: string) {
	return p.replaceAll("\\", "/");
}

function inSrcSegment(file: string, segment: string): boolean {
	return new RegExp(`/src/${segment}(/|$)`).test(file);
}

function backendLayer(file: string): string {
	const f = normalize(file);
	if (inSrcSegment(f, "types")) return "types";
	if (inSrcSegment(f, "config")) return "config";
	if (inSrcSegment(f, "db")) return "db";
	if (inSrcSegment(f, "repositories")) return "repositories";
	if (inSrcSegment(f, "services")) return "services";
	if (
		inSrcSegment(f, "app") ||
		inSrcSegment(f, "routes") ||
		/\/src\/index\.ts$/.test(f)
	)
		return "runtime";
	if (inSrcSegment(f, "lib")) return "shared";
	return "other";
}

const backendForbiddenImports: Record<string, string[]> = {
	config: ["db", "repositories", "services", "runtime"],
	db: ["repositories", "services", "runtime"],
	repositories: ["services", "runtime"],
	services: ["runtime"],
	shared: ["repositories", "services", "runtime"],
	types: ["config", "db", "repositories", "services", "runtime"],
};

function resolveImport(fromFile: string, spec: string): string | null {
	if (!spec.startsWith(".")) return null;
	const base = path.dirname(fromFile);
	const candidate = normalize(path.resolve(base, spec));
	return candidate;
}

function addViolation(
	file: string,
	importPath: string,
	reason: string,
	fix: string,
) {
	violations.push({
		file: normalize(path.relative(ROOT, file)),
		importPath,
		reason,
		fix,
	});
}

async function* walkTsFiles(root: string): AsyncGenerator<string> {
	if (!existsSync(root)) return;
	const glob = new Bun.Glob("**/*.ts");
	for await (const rel of glob.scan({ cwd: root, absolute: true })) {
		if (rel.endsWith(".test.ts")) continue;
		yield rel;
	}
}

async function lintBackend() {
	for await (const file of walkTsFiles(BACKEND_DIR)) {
		const source = await readFile(file, "utf8");
		const layer = backendLayer(file);
		if (layer === "other") continue;

		for (const m of source.matchAll(IMPORT_RE)) {
			const spec = m[1];
			const resolved = resolveImport(file, spec);
			if (!resolved) continue;
			if (!normalize(resolved).includes("/backend/src/")) continue;

			const targetLayer = backendLayer(resolved);
			const forbidden = backendForbiddenImports[layer] ?? [];
			if (forbidden.includes(targetLayer)) {
				addViolation(
					file,
					spec,
					`${layer} must not import ${targetLayer}`,
					`Move shared logic down-layer or introduce an interface boundary in ${layer}`,
				);
			}
		}
	}
}

function isPlatformInternal(file: string) {
	const f = normalize(file);
	return /\/extension\/src\/platforms\/[^/]+\/(selectors|parser|route-detector|surface|plugin)(\.ts)?$/.test(
		f,
	);
}

function isInPlatformsTree(file: string) {
	return normalize(file).includes("/extension/src/platforms/");
}

function isSharedLibFile(file: string) {
	return normalize(file).includes("/extension/src/lib/");
}

async function lintExtension() {
	for await (const file of walkTsFiles(EXT_DIR)) {
		const source = await readFile(file, "utf8");
		for (const m of source.matchAll(IMPORT_RE)) {
			const spec = m[1];
			const resolved = resolveImport(file, spec);
			if (!resolved) continue;
			if (!normalize(resolved).includes("/extension/src/")) continue;

			if (!isInPlatformsTree(file) && isPlatformInternal(resolved)) {
				addViolation(
					file,
					spec,
					"only platform modules may import platform internals (selectors/parser/route-detector/surface/plugin)",
					"Import platform public entrypoints instead of private platform internals",
				);
			}

			if (isSharedLibFile(file) && isInPlatformsTree(resolved)) {
				addViolation(
					file,
					spec,
					"shared lib must not depend on platform-specific modules",
					"Move platform-specific behavior out of src/lib into src/platforms/*",
				);
			}
		}
	}
}

await lintBackend();
await lintExtension();

if (violations.length > 0) {
	for (const v of violations) {
		console.error(
			`[ARCHLINT] ERROR: ${v.file} imports '${v.importPath}' -> ${v.reason}. Remediation: ${v.fix}.`,
		);
	}
	console.error(`[ARCHLINT] FAIL: ${violations.length} violation(s)`);
	process.exit(1);
}

console.log("[ARCHLINT] PASS: 0 violation(s)");
