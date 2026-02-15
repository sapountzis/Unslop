export const CHECKS_ERROR = {
	usage: "usage_error",
	unknownTarget: "unknown_target",
	checkerFailed: "checker_failed",
	process: "process_error",
} as const;

export type ChecksErrorCode = (typeof CHECKS_ERROR)[keyof typeof CHECKS_ERROR];

export class ChecksError extends Error {
	readonly code: ChecksErrorCode;
	readonly exitCode: number;

	constructor(message: string, code: ChecksErrorCode, exitCode = 1) {
		super(message);
		this.name = "ChecksError";
		this.code = code;
		this.exitCode = exitCode;
	}
}
