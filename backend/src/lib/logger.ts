import type { AppLogger, LogMeta } from "./logger-types";

const SENSITIVE_KEY_PATTERN =
	/(token|authorization|password|secret|api[_-]?key|cookie|jwt|session)/i;
const MAX_DEPTH = 4;

export interface LoggerConfig {
	nodeEnv: string;
}

function sanitizeValue(value: unknown, depth = 0, isDev: boolean): unknown {
	if (depth > MAX_DEPTH) {
		return "[truncated]";
	}

	if (value === null || value === undefined) {
		return value;
	}

	if (value instanceof Date) {
		return value.toISOString();
	}

	if (value instanceof Error) {
		return {
			name: value.name,
			message: value.message,
			stack: isDev ? value.stack : undefined,
		};
	}

	if (Array.isArray(value)) {
		return value.map((item) => sanitizeValue(item, depth + 1, isDev));
	}

	if (typeof value === "object") {
		const sanitized: Record<string, unknown> = {};

		for (const [key, nestedValue] of Object.entries(
			value as Record<string, unknown>,
		)) {
			if (SENSITIVE_KEY_PATTERN.test(key)) {
				sanitized[key] = "[redacted]";
			} else {
				sanitized[key] = sanitizeValue(nestedValue, depth + 1, isDev);
			}
		}

		return sanitized;
	}

	return value;
}

function writeLog(
	level: "info" | "warn" | "error",
	message: string,
	payload: LogMeta = {},
	isDev: boolean,
): void {
	const sanitizedPayload = sanitizeValue(payload, 0, isDev) as LogMeta;
	const event = {
		level,
		timestamp: new Date().toISOString(),
		message,
		...sanitizedPayload,
	};

	const line = JSON.stringify(event);
	if (level === "error") {
		console.error(line);
	} else {
		console.log(line);
	}
}

export function createLogger(config: LoggerConfig): AppLogger {
	const isDev = config.nodeEnv === "development";

	return {
		info: (message: string, meta: LogMeta = {}) => {
			writeLog("info", message, meta, isDev);
		},
		warn: (message: string, meta: LogMeta = {}) => {
			writeLog("warn", message, meta, isDev);
		},
		error: (message: string, error: unknown, meta: LogMeta = {}) => {
			writeLog(
				"error",
				message,
				{
					...meta,
					error,
				},
				isDev,
			);
		},
	};
}

export const logger = createLogger({
	nodeEnv: process.env.NODE_ENV ?? "development",
});
