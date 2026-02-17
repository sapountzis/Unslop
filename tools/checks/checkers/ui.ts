import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import path from "node:path";
import { defineChecker } from "../core/define-checker";
import { outputFor } from "./shared";

function isPortAvailable(port: number): Promise<boolean> {
	return new Promise((resolve) => {
		const server = createServer();
		server.unref();
		server.once("error", () => resolve(false));
		server.listen({ host: "127.0.0.1", port }, () =>
			server.close(() => resolve(true)),
		);
	});
}

async function pickPort(raw: string | undefined): Promise<number> {
	const explicit = raw ? Number.parseInt(raw, 10) : Number.NaN;
	if (!Number.isNaN(explicit) && explicit > 0) {
		return explicit;
	}
	for (let i = 0; i < 30; i += 1) {
		const candidate = 4300 + Math.floor(Math.random() * 500);
		if (await isPortAvailable(candidate)) {
			return candidate;
		}
	}
	return 4321;
}

export const uiChecker = defineChecker({
	id: "ui",
	retryCommand: "make ui",
	async run(ctx) {
		const rootDir = process.cwd();
		const tempDir = mkdtempSync(path.join(rootDir, ".tmp-check-ui."));
		const port = await pickPort(process.env.UI_CHECK_PORT);
		const logs: string[] = [];
		const server = Bun.spawn(
			["bun", "run", "dev", "--host", "127.0.0.1", "--port", String(port)],
			{ cwd: path.join(rootDir, "frontend"), stdout: "pipe", stderr: "pipe" },
		);
		const capture = async (stream: ReadableStream<Uint8Array> | null) => {
			if (!stream) return;
			const reader = stream.getReader();
			while (true) {
				const next = await reader.read();
				if (next.done) break;
				logs.push(Buffer.from(next.value).toString("utf8"));
				if (logs.length > 200) logs.splice(0, logs.length - 200);
			}
		};
		void capture(server.stdout);
		void capture(server.stderr);

		try {
			let ready = false;
			for (let i = 0; i < 60; i += 1) {
				try {
					await fetch(`http://127.0.0.1:${port}`, {
						signal: AbortSignal.timeout(750),
					});
					ready = true;
					break;
				} catch {
					if (server.exitCode !== null) break;
					await new Promise((resolve) => setTimeout(resolve, 1000));
				}
			}
			if (!ready) {
				const lines = [
					`[CHECK:UI] FAIL: frontend server did not become ready on http://127.0.0.1:${port}.`,
				];
				const startup = logs.join("\n").trim();
				if (startup)
					lines.push(
						"[CHECK:UI] Frontend startup log tail:",
						ctx.tail(startup, 40),
					);
				lines.push(
					"[CHECK:UI] Remediation: fix frontend startup errors shown above.",
				);
				lines.push("[CHECK:UI] Protocol: re-run 'make ui' until it passes.");
				ctx.fail(lines);
			}

			const result = await ctx.exec({
				args: [
					"bunx",
					"playwright",
					"test",
					"--config",
					"playwright.config.ts",
					"--output",
					path.join(tempDir, "test-results"),
				],
				cwd: "frontend",
				env: {
					UI_CHECK_BASE_URL: `http://127.0.0.1:${port}`,
					PLAYWRIGHT_HTML_REPORT: path.join(tempDir, "playwright-report"),
				},
			});
			const output = outputFor(result);
			if (output.trim()) console.log(output);
			if (result.exitCode !== 0) {
				ctx.fail([
					"[CHECK:UI] FAIL: Playwright UI checks failed.",
					"[CHECK:UI] Remediation: address failing UI assertions in the output above.",
					"[CHECK:UI] Protocol: re-run 'make ui' until it passes.",
				]);
			}
			console.log("[CHECK:UI] PASS: Playwright UI checks are compliant.");
		} finally {
			server.kill();
			await server.exited;
			for (const target of [
				tempDir,
				path.join(rootDir, "test-results"),
				path.join(rootDir, "playwright-report"),
			]) {
				rmSync(target, { recursive: true, force: true });
			}
		}
	},
});
