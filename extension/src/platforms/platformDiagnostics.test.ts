import { describe, expect, it } from "bun:test";
import { ATTRIBUTES } from "../lib/selectors";
import { collectContentDiagnostics } from "./platformDiagnostics";

function makeDocRef(
	counts: Record<string, number>,
): Pick<Document, "querySelectorAll"> {
	return {
		querySelectorAll(selector: string) {
			const count = counts[selector] ?? 0;
			return { length: count } as unknown as NodeListOf<Element>;
		},
	};
}

describe("collectContentDiagnostics", () => {
	it("passes both checks when posts have been processed and hidden", () => {
		const docRef = makeDocRef({
			[`[${ATTRIBUTES.processed}]`]: 5,
			[`[${ATTRIBUTES.decision}="hide"]`]: 3,
		});
		const snapshot = collectContentDiagnostics(
			"linkedin",
			"https://www.linkedin.com/feed/",
			"/feed/",
			true,
			docRef,
		);
		expect(snapshot.platformId).toBe("linkedin");
		expect(snapshot.routeEligible).toBe(true);
		expect(
			snapshot.checks.find((c) => c.id === "posts_processed")?.status,
		).toBe("pass");
		expect(
			snapshot.checks.find((c) => c.id === "posts_classified")?.status,
		).toBe("pass");
	});

	it("warns both checks when no posts processed yet on eligible route", () => {
		const docRef = makeDocRef({
			[`[${ATTRIBUTES.processed}]`]: 0,
			[`[${ATTRIBUTES.decision}="hide"]`]: 0,
		});
		const snapshot = collectContentDiagnostics(
			"x",
			"https://x.com/home",
			"/home",
			true,
			docRef,
		);
		expect(
			snapshot.checks.find((c) => c.id === "posts_processed")?.status,
		).toBe("warn");
		expect(
			snapshot.checks.find((c) => c.id === "posts_classified")?.status,
		).toBe("warn");
	});

	it("fails posts_processed on ineligible route", () => {
		const docRef = makeDocRef({
			[`[${ATTRIBUTES.processed}]`]: 0,
			[`[${ATTRIBUTES.decision}="hide"]`]: 0,
		});
		const snapshot = collectContentDiagnostics(
			"reddit",
			"https://www.reddit.com/settings/",
			"/settings/",
			false,
			docRef,
		);
		expect(snapshot.routeEligible).toBe(false);
		expect(
			snapshot.checks.find((c) => c.id === "posts_processed")?.status,
		).toBe("fail");
	});
});
