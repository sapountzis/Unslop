import { createWriteStream, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import { CHECKS_ERROR, ChecksError } from "./errors";
import {
	formatCheckUsage,
	getChecker,
	resolveExecutionOrder,
} from "./registry";

export const CHECK_USAGE = formatCheckUsage();

function retryCommandFor(target: string, isAll: boolean): string {
	if (isAll) {
		return "make check";
	}
	const checker = getChecker(target);
	return checker?.retryCommand ?? "make check";
}

async function runGateSubprocess(
	rootDir: string,
	tmpDir: string,
	gate: string,
): Promise<{ ok: true } | { ok: false; logPath: string; tail: string }> {
	mkdirSync(tmpDir, { recursive: true });
	const logPath = path.join(tmpDir, `${gate}.log`);
	const proc = Bun.spawn(
		[process.execPath, "run", "./tools/checks/cli.ts", "gate", gate],
		{
			cwd: rootDir,
			env: {
				...process.env,
				TMPDIR: tmpDir,
				UNSLOP_CHECK_TMPDIR: tmpDir,
			},
			stdout: "pipe",
			stderr: "pipe",
		},
	);

	const logWriter = createWriteStream(logPath, { encoding: "utf8" });
	const tail: string[] = [];
	let logWriteError: Error | null = null;

	logWriter.on("error", (error) => {
		logWriteError = error;
		try {
			proc.kill();
		} catch {
			// Process may already be done.
		}
	});

	const capture = async (stream: ReadableStream<Uint8Array> | null) => {
		if (!stream) {
			return;
		}
		const reader = stream.getReader();
		while (true) {
			const next = await reader.read();
			if (next.done) {
				break;
			}
			const chunk = Buffer.from(next.value).toString("utf8");
			if (!logWriteError) {
				logWriter.write(chunk);
			}
			for (const line of chunk.split(/\r?\n/)) {
				if (!line) {
					continue;
				}
				tail.push(line);
				if (tail.length > 200) {
					tail.shift();
				}
			}
		}
	};

	await Promise.all([capture(proc.stdout), capture(proc.stderr)]);
	const exitCode = await proc.exited;
	await new Promise<void>((resolve) => logWriter.end(() => resolve()));
	if (logWriteError) {
		throw new ChecksError(
			`failed to write gate log '${logPath}': ${logWriteError.message}`,
			CHECKS_ERROR.process,
		);
	}

	if (exitCode !== 0) {
		return { ok: false, logPath, tail: tail.join("\n") };
	}
	return { ok: true };
}

function failGate(retryCommand: string, tail: string): never {
	if (tail.length > 0) {
		console.error(tail);
	} else {
		console.error(
			`[ERROR] command failed without diagnostics. Re-run '${retryCommand}' for details.`,
		);
	}
	throw new ChecksError("", CHECKS_ERROR.checkerFailed);
}

export async function runCheckTarget(
	rootDir: string,
	target: string,
): Promise<void> {
	const gates = resolveExecutionOrder(target);
	const tmpDir = mkdtempSync(path.join(rootDir, ".tmp-check."));
	try {
		for (const gate of gates) {
			const result = await runGateSubprocess(rootDir, tmpDir, gate);
			if (!result.ok) {
				failGate(retryCommandFor(gate, target === "all"), result.tail);
			}
		}
	} finally {
		rmSync(tmpDir, { recursive: true, force: true });
	}
}
