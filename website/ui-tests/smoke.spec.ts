import { test, expect } from "@playwright/test";

const baseUrl = process.env.UI_CHECK_BASE_URL ?? "http://127.0.0.1:4321";

test("frontend smoke", async ({ page }) => {
	await page.goto(baseUrl);
	await expect(page).toHaveTitle(/Unslop|unslop/i);
});
