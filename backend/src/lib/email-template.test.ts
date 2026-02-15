import { describe, expect, it } from "bun:test";
import { buildMagicLinkEmailContent } from "./email-template";

describe("buildMagicLinkEmailContent", () => {
	it("builds transactional subject, text and html with the provided link", () => {
		const link = "https://api.getunslop.com/v1/auth/callback?token=abc123";
		const content = buildMagicLinkEmailContent({
			link,
			appName: "Unslop",
			expiresInMinutes: 15,
		});

		expect(content.subject).toBe("Sign in to Unslop");
		expect(content.text).toContain(link);
		expect(content.text).toContain(
			"If you didn't request this, you can ignore this email.",
		);
		expect(content.html).toContain("Sign in to Unslop");
		expect(content.html).toContain("Use it within 15 minutes");
		expect(content.html).toContain(`href="${link}"`);
	});

	it("escapes HTML-sensitive characters in links", () => {
		const content = buildMagicLinkEmailContent({
			link: 'https://api.getunslop.com/v1/auth/callback?token=<bad>&x="1"',
		});

		expect(content.html).toContain("&lt;bad&gt;");
		expect(content.html).toContain("&quot;1&quot;");
		expect(content.html).not.toContain("token=<bad>");
	});
});
