export type ExecResult = {
	exitCode: number;
	stdout: string;
	stderr: string;
};

function toUtf8(value: string | Uint8Array): string {
	if (typeof value === "string") {
		return value;
	}
	return Buffer.from(value).toString("utf8");
}

export function exec(
	args: string[],
	cwd: string,
	options?: {
		env?: NodeJS.ProcessEnv;
		stdio?: "pipe" | "inherit";
	},
): ExecResult {
	const stdio = options?.stdio ?? "pipe";
	const proc = Bun.spawnSync(args, {
		cwd,
		env: options?.env ?? process.env,
		stdout: stdio,
		stderr: stdio,
	});
	if (stdio === "inherit") {
		return { exitCode: proc.exitCode, stdout: "", stderr: "" };
	}
	return {
		exitCode: proc.exitCode,
		stdout: toUtf8(proc.stdout).trimEnd(),
		stderr: toUtf8(proc.stderr).trimEnd(),
	};
}

export function execGit(rootDir: string, gitArgs: string[]): ExecResult {
	return exec(["git", "-C", rootDir, ...gitArgs], rootDir);
}

export function execGh(rootDir: string, ghArgs: string[]): ExecResult {
	return exec(["gh", ...ghArgs], rootDir);
}
