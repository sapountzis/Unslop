import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { logger } from "./logger";

const originalConsoleLog = console.log;
const originalConsoleError = console.error;

describe("logger sanitization", () => {
	const logSpy = mock((..._args: unknown[]) => {});
	const errorSpy = mock((..._args: unknown[]) => {});

	beforeEach(() => {
		logSpy.mockClear();
		errorSpy.mockClear();
		console.log = logSpy;
		console.error = errorSpy;
	});

	afterEach(() => {
		console.log = originalConsoleLog;
		console.error = originalConsoleError;
	});

	it("redacts sensitive keys including nested payloads", () => {
		logger.info("test_event", {
			authorization: "Bearer raw-token",
			nested: {
				apiKey: "secret-value",
				profile: {
					email: "x@example.com",
					session_token: "abc",
				},
			},
		});

		expect(logSpy).toHaveBeenCalledTimes(1);
		const line = String(logSpy.mock.calls[0]?.[0] ?? "");
		const parsed = JSON.parse(line);

		expect(parsed.authorization).toBe("[redacted]");
		expect(parsed.nested.apiKey).toBe("[redacted]");
		expect(parsed.nested.profile.session_token).toBe("[redacted]");
		expect(parsed.nested.profile.email).toBe("x@example.com");
	});

	it("logs errors to stderr with sanitized context", () => {
		logger.error("failure", new Error("boom"), {
			token: "secret-token",
			request: { cookie: "abc" },
		});

		expect(errorSpy).toHaveBeenCalledTimes(1);
		const line = String(errorSpy.mock.calls[0]?.[0] ?? "");
		const parsed = JSON.parse(line);

		expect(parsed.token).toBe("[redacted]");
		expect(parsed.request.cookie).toBe("[redacted]");
		expect(parsed.error.message).toBe("boom");
	});
});
