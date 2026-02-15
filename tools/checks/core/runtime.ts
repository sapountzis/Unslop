import {
	accessSync,
	constants,
	existsSync,
	readdirSync,
	rmSync,
} from "node:fs";
import path from "node:path";
import { CHECKS_ERROR, ChecksError } from "./errors";
import type { CheckContext, CommandResult, CommandSpec } from "./types";

const TRANSIENT_PATTERNS = [
	/^\.tmp-check\.[^/]+$/,
	/^\.tmp-check-ui\.[^/]+$/,
	/^\.tmp-pr-body\.[^/]+$/,
	/^\.tmp-setup\.[^/]+$/,
	/^\.tmp-type\.[^/]+$/,
	/^\.tmp-test\.[^/]+$/,
];

export function resolveRootDir(): string {
	return process.cwd();
}

export function tailLines(input: string, maxLines: number): string {
	const lines = input.split(/\r?\n/).filter((line) => line.length > 0);
	return lines.slice(-maxLines).join("\n");
}

export function commandOutput(result: CommandResult): string {
	return [result.stdout, result.stderr]
		.filter((part) => part.length > 0)
		.join("\n");
}

export function writeIfPresent(
	text: string,
	stream: "stdout" | "stderr" = "stdout",
): void {
	if (text.trim().length === 0) {
		return;
	}
	const rendered = text.endsWith("\n") ? text : `${text}\n`;
	if (stream === "stderr") {
		process.stderr.write(rendered);
		return;
	}
	process.stdout.write(rendered);
}

async function readStream(
	stream: ReadableStream<Uint8Array> | null,
): Promise<string> {
	if (!stream) {
		return "";
	}
	const reader = stream.getReader();
	const chunks: string[] = [];
	while (true) {
		const next = await reader.read();
		if (next.done) {
			break;
		}
		chunks.push(Buffer.from(next.value).toString("utf8"));
	}
	return chunks.join("");
}

function resolveCommandCwd(rootDir: string, cwd?: string): string {
	if (!cwd) {
		return rootDir;
	}
	if (path.isAbsolute(cwd)) {
		return cwd;
	}
	return path.join(rootDir, cwd);
}

export async function runCommand(
	spec: CommandSpec,
	rootDir: string,
): Promise<CommandResult> {
	const proc = Bun.spawn(spec.args, {
		cwd: resolveCommandCwd(rootDir, spec.cwd),
		env: { ...process.env, ...spec.env },
		stdout: "pipe",
		stderr: "pipe",
	});

	let timedOut = false;
	let timeout: ReturnType<typeof setTimeout> | null = null;
	if (spec.timeoutMs && spec.timeoutMs > 0) {
		timeout = setTimeout(() => {
			timedOut = true;
			try {
				proc.kill();
			} catch {
				// Process already exited.
			}
		}, spec.timeoutMs);
	}

	try {
		const [stdout, stderr, exitCode] = await Promise.all([
			readStream(proc.stdout),
			readStream(proc.stderr),
			proc.exited,
		]);
		if (!timedOut) {
			return { exitCode, stdout, stderr };
		}
		const timeoutLine = `[ERROR] command timed out after ${spec.timeoutMs}ms: ${spec.args.join(" ")}`;
		return {
			exitCode,
			stdout,
			stderr: stderr.length > 0 ? `${stderr}\n${timeoutLine}` : timeoutLine,
			timedOut: true,
		};
	} finally {
		if (timeout) {
			clearTimeout(timeout);
		}
	}
}

export function createContext(rootDir: string): CheckContext {
	return {
		exec(spec) {
			return runCommand(spec, rootDir);
		},
		tail(text, maxLines) {
			return tailLines(text, maxLines);
		},
		fail(lines) {
			for (const line of lines) {
				writeIfPresent(line, "stderr");
			}
			throw new ChecksError("", CHECKS_ERROR.checkerFailed);
		},
	};
}

export function cleanupTempArtifacts(rootDir: string): void {
	if (!existsSync(rootDir)) {
		return;
	}

	const preservedTmpDirRaw = process.env.UNSLOP_CHECK_TMPDIR;
	const preservedTmpDir = preservedTmpDirRaw
		? path.resolve(rootDir, preservedTmpDirRaw)
		: null;

	for (const entry of readdirSync(rootDir)) {
		if (!TRANSIENT_PATTERNS.some((re) => re.test(entry))) {
			continue;
		}
		const abs = path.join(rootDir, entry);
		if (preservedTmpDir && abs === preservedTmpDir) {
			continue;
		}
		rmSync(abs, { recursive: true, force: true });
	}

	rmSync(path.join(rootDir, "test-results"), { recursive: true, force: true });
	rmSync(path.join(rootDir, "playwright-report"), {
		recursive: true,
		force: true,
	});
}

export async function withCleanup<T>(
	rootDir: string,
	run: () => Promise<T> | T,
): Promise<T> {
	cleanupTempArtifacts(rootDir);
	let result: T | undefined;
	let error: unknown;

	try {
		result = await run();
	} catch (caught) {
		error = caught;
	}

	if (existsSync(rootDir)) {
		cleanupTempArtifacts(rootDir);
	} else {
		console.error(
			"[CLEANUP] INFO: skipped post-command temp cleanup because worktree is no longer available.",
		);
	}

	if (error) {
		throw error;
	}

	return result as T;
}

export function isExecutable(absPath: string): boolean {
	try {
		accessSync(absPath, constants.X_OK);
		return true;
	} catch {
		return false;
	}
}
