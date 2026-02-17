import { exec } from "./process";

export function runSetup(rootDir: string): void {
	const proc = exec(["bash", "./dev/setup.sh"], rootDir, {
		stdio: "inherit",
		env: process.env,
	});
	if (proc.exitCode !== 0) {
		throw new Error("setup failed");
	}
}
