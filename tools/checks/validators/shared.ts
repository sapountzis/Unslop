export function git(rootDir: string, args: string[]): string {
	const proc = Bun.spawnSync(["git", ...args], {
		cwd: rootDir,
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

export function normalizeStatusPath(rawPath: string): string {
	let normalized = rawPath.trim();
	if (normalized.includes(" -> ")) {
		const pieces = normalized.split(" -> ");
		normalized = pieces[pieces.length - 1];
	}
	if (normalized.startsWith('"') && normalized.endsWith('"')) {
		normalized = normalized
			.slice(1, -1)
			.replaceAll('\\"', '"')
			.replaceAll("\\\\", "\\");
	}
	return normalized;
}

export function parseStatusPaths(raw: string): string[] {
	const out: string[] = [];
	for (const line of raw.split("\n")) {
		if (!line.trim()) {
			continue;
		}
		if (line.length < 4) {
			continue;
		}
		const normalized = normalizeStatusPath(line.slice(3));
		if (normalized) {
			out.push(normalized);
		}
	}
	return out;
}

export function unique(items: string[]): string[] {
	return [...new Set(items)];
}
