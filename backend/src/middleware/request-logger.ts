import type { MiddlewareHandler } from "hono";
import { logger } from "../lib/logger";
import type { AppLogger } from "../lib/logger-types";

interface RequestLoggerDeps {
	logger: Pick<AppLogger, "info">;
	nowMs?: () => number;
}

export function createRequestLogger(
	deps: RequestLoggerDeps,
): MiddlewareHandler {
	return async (c, next) => {
		const startedAt = (deps.nowMs ?? Date.now)();
		const path = c.req.path;

		try {
			await next();
		} finally {
			deps.logger.info("http_request", {
				method: c.req.method,
				path,
				status: c.res.status,
				duration_ms: (deps.nowMs ?? Date.now)() - startedAt,
			});
		}
	};
}

export const requestLogger = createRequestLogger({
	logger,
	nowMs: () => Date.now(),
});
