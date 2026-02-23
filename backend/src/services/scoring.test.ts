import { describe, expect, it } from "bun:test";
import { ScoringEngine } from "./scoring";
import type { ScoreResult } from "../types/classification";

process.env.TEST_MODE = process.env.TEST_MODE || "true";
process.env.DATABASE_URL =
	process.env.DATABASE_URL ||
	"postgres://postgres:postgres@localhost:5432/unslop_test";
process.env.APP_URL = process.env.APP_URL || "http://localhost:3000";
process.env.MAGIC_LINK_BASE_URL =
	process.env.MAGIC_LINK_BASE_URL || "http://localhost:3000";
process.env.VLM_MODEL = process.env.VLM_MODEL || "test-vlm";

function scores(partial: Partial<ScoreResult>): ScoreResult {
	return {
		signal: 0,
		manipulation: 0,
		template: 0,
		...partial,
	};
}

const engine = new ScoringEngine();

describe("step 1: hard vetoes", () => {
	it("hides on extreme manipulation (m >= 0.7)", () => {
		const out = engine.score(scores({ manipulation: 0.7 }));
		expect(out.decision).toBe("hide");
		expect(out.ruleId).toBe("H1_MANIP");
	});

	it("hides on extreme template (t >= 0.8)", () => {
		const out = engine.score(scores({ template: 0.8 }));
		expect(out.decision).toBe("hide");
		expect(out.ruleId).toBe("H1_TEMPLATE");
	});

	it("hides on combo manipulation + template", () => {
		const out = engine.score(scores({ manipulation: 0.6, template: 0.6 }));
		expect(out.decision).toBe("hide");
		expect(out.ruleId).toBe("H1_COMBO");
	});
});

describe("step 2: signal rescue", () => {
	it("strong signal rescues moderate manipulation", () => {
		const out = engine.score(scores({ signal: 0.7, manipulation: 0.6 }));
		expect(out.decision).toBe("keep");
		expect(out.ruleId).toBe("K1_STRONG_SIGNAL");
	});

	it("good signal rescues low manipulation", () => {
		const out = engine.score(scores({ signal: 0.5, manipulation: 0.5 }));
		expect(out.decision).toBe("keep");
		expect(out.ruleId).toBe("K1_SIGNAL");
	});
});

describe("step 3: authenticity pass", () => {
	it("genuine human content passes if manipulation and template are low", () => {
		const out = engine.score(
			scores({ signal: 0.3, manipulation: 0.3, template: 0.4 }),
		);
		expect(out.decision).toBe("keep");
		expect(out.ruleId).toBe("K1_AUTHENTIC");
	});
});

describe("step 4: soft vetoes", () => {
	it("moderate manipulation + weak signal hides", () => {
		const out = engine.score(scores({ manipulation: 0.5, signal: 0.2 }));
		expect(out.decision).toBe("hide");
		expect(out.ruleId).toBe("S1_MANIP");
	});

	it("moderate template + weak signal hides", () => {
		const out = engine.score(scores({ template: 0.6, signal: 0.2 }));
		expect(out.decision).toBe("hide");
		expect(out.ruleId).toBe("S1_TEMPLATE");
	});
});

describe("step 5: default", () => {
	it("shows by default for everything else", () => {
		const out = engine.score(
			scores({ signal: 0.2, manipulation: 0.2, template: 0.2 }),
		);
		expect(out.decision).toBe("keep");
		expect(out.ruleId).toBe("K2_DEFAULT");
	});

	it("keeps null result as keep/error", () => {
		const out = engine.score(null);
		expect(out.decision).toBe("keep");
		expect(out.ruleId).toBe("E0_ERROR");
	});
});

describe("calibration examples", () => {
	const examples: Array<{
		name: string;
		scores: Partial<ScoreResult>;
		expected: "keep" | "hide";
	}> = [
		{
			name: "Ex1: We reduced p95 latency...",
			scores: { signal: 0.9, manipulation: 0.1, template: 0.1 },
			expected: "keep",
		},
		{
			name: "Ex2: I'm SO hyped about growth right now...",
			scores: { signal: 0.1, manipulation: 0.5, template: 0.8 },
			expected: "hide",
		},
		{
			name: "Ex3: I got rejected after 4 interviews...",
			scores: { signal: 0.6, manipulation: 0.1, template: 0.2 },
			expected: "keep",
		},
		{
			name: "Ex4: I turned down 6 offers this month...",
			scores: { signal: 0.1, manipulation: 0.8, template: 0.7 },
			expected: "hide",
		},
		{
			name: "Ex5: Hot take: daily standups aren't always...",
			scores: { signal: 0.7, manipulation: 0.1, template: 0.1 },
			expected: "keep",
		},
		{
			name: "Ex6: Daily standups are a scam...",
			scores: { signal: 0.2, manipulation: 0.8, template: 0.4 },
			expected: "hide",
		},
		{
			name: "Ex7: my daughter just showed me her first coding project...",
			scores: { signal: 0.1, manipulation: 0.0, template: 0.0 },
			expected: "keep",
		},
		{
			name: "Ex8: What's the one piece of advice you'd give...",
			scores: { signal: 0.0, manipulation: 0.3, template: 0.9 },
			expected: "hide",
		},
		{
			name: "Ex9: I'm shaking right now. 3 years ago...",
			scores: { signal: 0.0, manipulation: 0.8, template: 0.9 },
			expected: "hide",
		},
		{
			name: "Ex10: love how every company says...",
			scores: { signal: 0.2, manipulation: 0.1, template: 0.0 },
			expected: "keep",
		},
		{
			name: "Ex11: Has anyone dealt with a leaking dishwasher...",
			scores: { signal: 0.5, manipulation: 0.0, template: 0.0 },
			expected: "keep",
		},
		{
			name: "Ex12: STOP using Product A immediately...",
			scores: { signal: 0.1, manipulation: 0.8, template: 0.8 },
			expected: "hide",
		},
	];

	for (const ex of examples) {
		it(ex.name, () => {
			const out = engine.score(scores(ex.scores));
			expect(out.decision).toBe(ex.expected);
		});
	}
});
