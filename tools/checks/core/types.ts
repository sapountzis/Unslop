export interface CommandSpec {
	args: string[];
	cwd?: string;
	env?: Record<string, string | undefined>;
	timeoutMs?: number;
}

export interface CommandResult {
	exitCode: number;
	stdout: string;
	stderr: string;
	timedOut?: boolean;
}

export interface CheckContext {
	exec(spec: CommandSpec): Promise<CommandResult>;
	tail(text: string, maxLines: number): string;
	fail(lines: string[]): never;
}

export interface Checker {
	id: string;
	retryCommand: string;
	run(ctx: CheckContext): Promise<void> | void;
}
