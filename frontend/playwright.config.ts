import { defineConfig } from "@playwright/test";

export default defineConfig({
	testDir: "./ui-tests",
	retries: 0,
	use: {
		headless: true,
	},
	timeout: 30_000,
});
