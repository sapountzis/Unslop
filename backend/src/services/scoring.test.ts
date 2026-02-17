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
		u: 0,
		d: 0,
		c: 0,
		rb: 0,
		eb: 0,
		sp: 0,
		p: 0,
		x: 0,
		...partial,
	};
}

const engine = new ScoringEngine();

// ─────────────────────────────────────────────────────
// Step 1: Hard Vetoes
// ─────────────────────────────────────────────────────

describe("step 1: hard vetoes", () => {
	it("hides on high rage bait (rb >= 0.7)", () => {
		const out = engine.score(scores({ rb: 0.7 }));
		expect(out.decision).toBe("hide");
		expect(out.ruleId).toBe("H1_RAGE");
	});

	it("hides on high deception (x >= 0.7)", () => {
		const out = engine.score(scores({ x: 0.7 }));
		expect(out.decision).toBe("hide");
		expect(out.ruleId).toBe("H1_DECEPTION");
	});

	it("hides on pure sales (sp >= 0.8)", () => {
		const out = engine.score(scores({ sp: 0.8 }));
		expect(out.decision).toBe("hide");
		expect(out.ruleId).toBe("H1_SALES");
	});

	it("rage veto overrides high signal", () => {
		const out = engine.score(scores({ u: 0.9, d: 0.9, rb: 0.7 }));
		expect(out.decision).toBe("hide");
		expect(out.ruleId).toBe("H1_RAGE");
	});

	it("deception veto overrides high connection", () => {
		const out = engine.score(scores({ c: 0.9, x: 0.8 }));
		expect(out.decision).toBe("hide");
		expect(out.ruleId).toBe("H1_DECEPTION");
	});
});

// ─────────────────────────────────────────────────────
// Step 2: Signal Rescue (with safety gate)
// ─────────────────────────────────────────────────────

describe("step 2: signal rescue", () => {
	it("keeps on high usefulness with clean safety gate", () => {
		const out = engine.score(scores({ u: 0.6 }));
		expect(out.decision).toBe("keep");
		expect(out.ruleId).toBe("K1_SIGNAL");
	});

	it("keeps on high depth with clean safety gate", () => {
		const out = engine.score(scores({ d: 0.7 }));
		expect(out.decision).toBe("keep");
		expect(out.ruleId).toBe("K1_SIGNAL");
	});

	it("keeps on high connection with clean safety gate", () => {
		const out = engine.score(scores({ c: 0.6 }));
		expect(out.decision).toBe("keep");
		expect(out.ruleId).toBe("K1_HUMAN");
	});

	it("safety gate blocks rescue when rb is moderate", () => {
		const out = engine.score(scores({ u: 0.8, rb: 0.5 }));
		expect(out.decision).toBe("hide");
		expect(out.ruleId).toBe("S1_RAGE");
	});

	it("safety gate blocks rescue when x is moderate", () => {
		const out = engine.score(scores({ u: 0.8, x: 0.5 }));
		expect(out.decision).toBe("hide");
		expect(out.ruleId).toBe("S1_DECEPTION");
	});

	it("rescue passes when rb/x are just below gate", () => {
		const out = engine.score(scores({ u: 0.6, rb: 0.4, x: 0.4 }));
		expect(out.decision).toBe("keep");
		expect(out.ruleId).toBe("K1_SIGNAL");
	});
});

// ─────────────────────────────────────────────────────
// Step 3: Soft Vetoes
// ─────────────────────────────────────────────────────

describe("step 3: soft vetoes", () => {
	it("hides on moderate rage bait (rb >= 0.5)", () => {
		const out = engine.score(scores({ rb: 0.5 }));
		expect(out.decision).toBe("hide");
		expect(out.ruleId).toBe("S1_RAGE");
	});

	it("hides on moderate deception (x >= 0.5)", () => {
		const out = engine.score(scores({ x: 0.5 }));
		expect(out.decision).toBe("hide");
		expect(out.ruleId).toBe("S1_DECEPTION");
	});

	it("hides on moderate sales pitch (sp >= 0.5)", () => {
		const out = engine.score(scores({ sp: 0.5 }));
		expect(out.decision).toBe("hide");
		expect(out.ruleId).toBe("S1_SALES");
	});

	it("hides on packaging slop (p >= 0.7)", () => {
		const out = engine.score(scores({ p: 0.7 }));
		expect(out.decision).toBe("hide");
		expect(out.ruleId).toBe("S1_PACKAGING");
	});

	it("hides on ego noise (eb >= 0.6)", () => {
		const out = engine.score(scores({ eb: 0.6 }));
		expect(out.decision).toBe("hide");
		expect(out.ruleId).toBe("S1_EGO");
	});

	it("does NOT hide on moderate packaging below threshold", () => {
		const out = engine.score(scores({ p: 0.6 }));
		expect(out.decision).toBe("keep");
		expect(out.ruleId).toBe("K2_NEUTRAL");
	});
});

// ─────────────────────────────────────────────────────
// Step 4: Default
// ─────────────────────────────────────────────────────

describe("step 4: default", () => {
	it("keeps all-zero scores", () => {
		const out = engine.score(scores({}));
		expect(out.decision).toBe("keep");
		expect(out.ruleId).toBe("K2_NEUTRAL");
	});

	it("keeps low-signal low-noise posts", () => {
		const out = engine.score(scores({ u: 0.3, c: 0.4, rb: 0.2, p: 0.3 }));
		expect(out.decision).toBe("keep");
		expect(out.ruleId).toBe("K2_NEUTRAL");
	});

	it("keeps null result as keep/error", () => {
		const out = engine.score(null);
		expect(out.decision).toBe("keep");
		expect(out.ruleId).toBe("E0_ERROR");
	});
});

// ─────────────────────────────────────────────────────
// Audit metadata
// ─────────────────────────────────────────────────────

describe("audit metadata", () => {
	it("reports max signal and max noise correctly", () => {
		const out = engine.score(
			scores({ u: 0.8, d: 0.3, c: 0.5, rb: 0.2, eb: 0.4, p: 0.1 }),
		);
		expect(out.audit.valueScore).toBe(0.8);
		expect(out.audit.slopScore).toBe(0.4);
	});

	it("clamps out-of-range values", () => {
		const out = engine.score(scores({ u: 1.5, rb: -0.3 }));
		expect(out.audit.clampedScores.u).toBe(1);
		expect(out.audit.clampedScores.rb).toBe(0);
	});
});

// ─────────────────────────────────────────────────────
// Regression: all 24 prompt examples
// ─────────────────────────────────────────────────────

describe("prompt example regression", () => {
	const examples: Array<{
		name: string;
		scores: Partial<ScoreResult>;
		expected: "keep" | "hide";
	}> = [
		{
			name: "Ex1: tech deep-dive",
			scores: {
				u: 0.9,
				d: 0.9,
				c: 0.5,
				rb: 0.0,
				eb: 0.2,
				sp: 0.0,
				p: 0.1,
				x: 0.0,
			},
			expected: "keep",
		},
		{
			name: "Ex2: enthusiastic useful",
			scores: {
				u: 0.8,
				d: 0.6,
				c: 0.7,
				rb: 0.0,
				eb: 0.1,
				sp: 0.0,
				p: 0.2,
				x: 0.0,
			},
			expected: "keep",
		},
		{
			name: "Ex3: empty hype tips",
			scores: {
				u: 0.1,
				d: 0.0,
				c: 0.3,
				rb: 0.3,
				eb: 0.6,
				sp: 0.0,
				p: 0.8,
				x: 0.2,
			},
			expected: "hide",
		},
		{
			name: "Ex4: rejection story",
			scores: {
				u: 0.6,
				d: 0.3,
				c: 0.9,
				rb: 0.0,
				eb: 0.1,
				sp: 0.0,
				p: 0.2,
				x: 0.0,
			},
			expected: "keep",
		},
		{
			name: "Ex5: humblebrag flex",
			scores: {
				u: 0.2,
				d: 0.0,
				c: 0.2,
				rb: 0.3,
				eb: 0.9,
				sp: 0.0,
				p: 0.7,
				x: 0.1,
			},
			expected: "hide",
		},
		{
			name: "Ex6: constructive opinion",
			scores: {
				u: 0.8,
				d: 0.6,
				c: 0.6,
				rb: 0.1,
				eb: 0.2,
				sp: 0.0,
				p: 0.1,
				x: 0.0,
			},
			expected: "keep",
		},
		{
			name: "Ex7: rage standups",
			scores: {
				u: 0.3,
				d: 0.2,
				c: 0.1,
				rb: 0.9,
				eb: 0.5,
				sp: 0.0,
				p: 0.4,
				x: 0.1,
			},
			expected: "hide",
		},
		{
			name: "Ex8: sales funnel",
			scores: {
				u: 0.7,
				d: 0.5,
				c: 0.4,
				rb: 0.0,
				eb: 0.2,
				sp: 0.8,
				p: 0.3,
				x: 0.0,
			},
			expected: "hide",
		},
		{
			name: "Ex9: robin hood funnel",
			scores: {
				u: 0.2,
				d: 0.1,
				c: 0.2,
				rb: 0.4,
				eb: 0.6,
				sp: 0.9,
				p: 0.7,
				x: 0.2,
			},
			expected: "hide",
		},
		{
			name: "Ex10: modest tip",
			scores: {
				u: 0.5,
				d: 0.2,
				c: 0.5,
				rb: 0.0,
				eb: 0.0,
				sp: 0.0,
				p: 0.2,
				x: 0.0,
			},
			expected: "keep",
		},
		{
			name: "Ex11: manufactured drama",
			scores: {
				u: 0.2,
				d: 0.1,
				c: 0.2,
				rb: 0.4,
				eb: 0.8,
				sp: 0.0,
				p: 0.8,
				x: 0.2,
			},
			expected: "hide",
		},
		{
			name: "Ex12: engagement farming",
			scores: {
				u: 0.0,
				d: 0.0,
				c: 0.2,
				rb: 0.0,
				eb: 0.1,
				sp: 0.3,
				p: 0.9,
				x: 0.0,
			},
			expected: "hide",
		},
		{
			name: 'Ex13: "I\'m shaking" template',
			scores: {
				u: 0.1,
				d: 0.0,
				c: 0.2,
				rb: 0.2,
				eb: 0.8,
				sp: 0.8,
				p: 0.9,
				x: 0.3,
			},
			expected: "hide",
		},
		{
			name: "Ex14: microservices criticism",
			scores: {
				u: 0.9,
				d: 0.8,
				c: 0.6,
				rb: 0.1,
				eb: 0.2,
				sp: 0.0,
				p: 0.0,
				x: 0.0,
			},
			expected: "keep",
		},
		{
			name: "Ex15: health genuine advice",
			scores: {
				u: 0.8,
				d: 0.6,
				c: 0.8,
				rb: 0.0,
				eb: 0.1,
				sp: 0.0,
				p: 0.1,
				x: 0.0,
			},
			expected: "keep",
		},
		{
			name: "Ex16: health pseudoscience",
			scores: {
				u: 0.1,
				d: 0.0,
				c: 0.2,
				rb: 0.5,
				eb: 0.3,
				sp: 0.2,
				p: 0.6,
				x: 0.9,
			},
			expected: "hide",
		},
		{
			name: "Ex17: political nuance",
			scores: {
				u: 0.7,
				d: 0.6,
				c: 0.6,
				rb: 0.2,
				eb: 0.1,
				sp: 0.0,
				p: 0.2,
				x: 0.1,
			},
			expected: "keep",
		},
		{
			name: "Ex18: political rage bait",
			scores: {
				u: 0.0,
				d: 0.0,
				c: 0.1,
				rb: 0.9,
				eb: 0.7,
				sp: 0.0,
				p: 0.5,
				x: 0.3,
			},
			expected: "hide",
		},
		{
			name: "Ex19: genuine product review",
			scores: {
				u: 0.7,
				d: 0.5,
				c: 0.6,
				rb: 0.0,
				eb: 0.1,
				sp: 0.1,
				p: 0.1,
				x: 0.0,
			},
			expected: "keep",
		},
		{
			name: "Ex20: shill product review",
			scores: {
				u: 0.1,
				d: 0.0,
				c: 0.1,
				rb: 0.2,
				eb: 0.3,
				sp: 0.9,
				p: 0.8,
				x: 0.5,
			},
			expected: "hide",
		},
		{
			name: "Ex21: sarcastic humor",
			scores: {
				u: 0.2,
				d: 0.1,
				c: 0.7,
				rb: 0.2,
				eb: 0.0,
				sp: 0.0,
				p: 0.0,
				x: 0.0,
			},
			expected: "keep",
		},
		{
			name: "Ex22: wholesome reaction",
			scores: {
				u: 0.0,
				d: 0.0,
				c: 0.8,
				rb: 0.0,
				eb: 0.0,
				sp: 0.0,
				p: 0.0,
				x: 0.0,
			},
			expected: "keep",
		},
		{
			name: "Ex23: community help",
			scores: {
				u: 0.5,
				d: 0.4,
				c: 0.6,
				rb: 0.0,
				eb: 0.0,
				sp: 0.0,
				p: 0.0,
				x: 0.0,
			},
			expected: "keep",
		},
		{
			name: "Ex24: parenting share",
			scores: {
				u: 0.1,
				d: 0.0,
				c: 0.9,
				rb: 0.0,
				eb: 0.0,
				sp: 0.0,
				p: 0.0,
				x: 0.0,
			},
			expected: "keep",
		},
	];

	for (const ex of examples) {
		it(ex.name, () => {
			const out = engine.score(scores(ex.scores));
			expect(out.decision).toBe(ex.expected);
		});
	}
});
