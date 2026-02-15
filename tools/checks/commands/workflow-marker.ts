import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { execGit } from "./process";

export type WorkflowMarker = {
	schema: number;
	feature_slug: string;
	branch: string;
	worktree_path: string;
	plan_path: string;
	base_branch: string;
	initialized_at: string;
};

export function git(rootDir: string, args: string[]): string {
	const result = execGit(rootDir, args);
	if (result.exitCode !== 0) {
		throw new Error(
			`git ${args.join(" ")} failed${result.stderr ? `: ${result.stderr}` : ""}`,
		);
	}
	return result.stdout.trim();
}

export function readWorkflowMarker(rootDir: string): {
	markerPath: string;
	marker: WorkflowMarker;
} {
	const markerPath = git(rootDir, [
		"rev-parse",
		"--git-path",
		"unslop-workflow.json",
	]);
	const absoluteMarkerPath = path.isAbsolute(markerPath)
		? markerPath
		: path.join(rootDir, markerPath);
	if (!markerPath || !existsSync(absoluteMarkerPath)) {
		throw new Error(
			`missing workflow marker: ${absoluteMarkerPath || "(empty path)"}`,
		);
	}

	const raw = readFileSync(absoluteMarkerPath, "utf8");
	const marker = JSON.parse(raw) as WorkflowMarker;
	if (!marker.plan_path || typeof marker.plan_path !== "string") {
		throw new Error("workflow marker missing required plan_path");
	}

	return { markerPath: absoluteMarkerPath, marker };
}
