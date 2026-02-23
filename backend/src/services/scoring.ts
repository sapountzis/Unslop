import { ScoreResult, Decision } from "../types/classification";
import { logger } from "../lib/logger";

// =========================================================
// 3-DIMENSION SCORING ENGINE
// =========================================================
//
// Decision logic is a cascading rule tree, NOT linear.
// This captures non-linear interactions like:
// "high manipulation is OK if signal is also high"
//
// The cascade order matters:
//   1. Hard vetoes   — extreme manipulation/template, always hide
//   2. Signal rescue  — strong value overrides moderate negatives
//   3. Authenticity   — genuine human content with low manipulation passes
//   4. Soft vetoes    — moderate negatives with no redeeming signal
//   5. Default        — show (don't over-filter)
// =========================================================

// ─── THRESHOLDS (tune these on your labeled data) ───

// Step 1: Hard vetoes
const HARD_VETO_M = 0.7;           // Manipulation this high = always hide
const HARD_VETO_T = 0.8;           // Template this high = always hide
const HARD_VETO_COMBO_M = 0.6;     // Manipulation + template combined veto
const HARD_VETO_COMBO_T = 0.6;     // (both moderately high = hide)

// Step 2: Signal rescue
const RESCUE_S = 0.5;              // Signal needed to rescue
const RESCUE_MAX_M = 0.5;          // Max manipulation allowed for rescue
const RESCUE_STRONG_S = 0.7;       // Strong signal rescues even with moderate manipulation
const RESCUE_STRONG_MAX_M = 0.6;   // Max manipulation allowed for strong rescue

// Step 3: Authenticity pass
const AUTH_S_LOW = 0.3;            // Minimum signal for authenticity pass (just not zero)
const AUTH_MAX_M = 0.3;            // Max manipulation for authenticity pass
const AUTH_MAX_T = 0.4;            // Max template for authenticity pass

// Step 4: Soft vetoes
const SOFT_VETO_M = 0.5;           // Moderate manipulation + weak signal = hide
const SOFT_VETO_T = 0.6;           // Moderate template + weak signal = hide
const SOFT_VETO_MAX_S = 0.3;       // Signal must be below this for soft vetoes to fire

// ─── TYPES ───

export type DecisionReason =
	| "extreme_manipulation"
	| "extreme_template"
	| "combined_manipulation_template"
	| "high_signal_rescue"
	| "strong_signal_rescue"
	| "authentic_content"
	| "moderate_manipulation"
	| "moderate_template"
	| "default_show"
	| "error";

export type RuleId =
	| "H1_MANIP"
	| "H1_TEMPLATE"
	| "H1_COMBO"
	| "K1_SIGNAL"
	| "K1_STRONG_SIGNAL"
	| "K1_AUTHENTIC"
	| "S1_MANIP"
	| "S1_TEMPLATE"
	| "K2_DEFAULT"
	| "E0_ERROR";

export type ScoringOutput = {
	decision: Decision;
	reason: DecisionReason;
	ruleId: RuleId;
	audit: {
		signal: number;
		manipulation: number;
		template: number;
	};
};

type Scores = { signal: number; manipulation: number; template: number };

export class ScoringEngine {
	public score(result: ScoreResult | null): ScoringOutput {
		// 0. Handle null/error
		if (!result) {
			return this.out("keep", "error", "E0_ERROR", { signal: 0, manipulation: 0, template: 0 });
		}

		// 1. Sanitize (clamp 0..1)
		const sc: Scores = {
			signal: this.clamp(result.signal ?? 0),
			manipulation: this.clamp(result.manipulation ?? 0),
			template: this.clamp(result.template ?? 0),
		};

		// ─── STEP 1: HARD VETOES ───
		// Extreme manipulation = always slop, regardless of signal
		if (sc.manipulation >= HARD_VETO_M) {
			return this.out("hide", "extreme_manipulation", "H1_MANIP", sc);
		}

		// Extreme template = always slop
		if (sc.template >= HARD_VETO_T) {
			return this.out("hide", "extreme_template", "H1_TEMPLATE", sc);
		}

		// Both moderately high = slop (catches posts that dodge individual thresholds)
		if (sc.manipulation >= HARD_VETO_COMBO_M && sc.template >= HARD_VETO_COMBO_T) {
			return this.out("hide", "combined_manipulation_template", "H1_COMBO", sc);
		}

		// ─── STEP 2: SIGNAL RESCUE ───
		// Strong signal rescues even with moderate manipulation
		if (sc.signal >= RESCUE_STRONG_S && sc.manipulation <= RESCUE_STRONG_MAX_M) {
			return this.out("keep", "strong_signal_rescue", "K1_STRONG_SIGNAL", sc);
		}

		// Good signal with low manipulation = keep
		if (sc.signal >= RESCUE_S && sc.manipulation <= RESCUE_MAX_M) {
			return this.out("keep", "high_signal_rescue", "K1_SIGNAL", sc);
		}

		// ─── STEP 3: AUTHENTICITY PASS ───
		// Low-signal but genuine human content (personal stories, humor, questions)
		// Only passes if manipulation AND template are both low
		if (sc.signal >= AUTH_S_LOW && sc.manipulation <= AUTH_MAX_M && sc.template <= AUTH_MAX_T) {
			return this.out("keep", "authentic_content", "K1_AUTHENTIC", sc);
		}

		// ─── STEP 4: SOFT VETOES ───
		// Moderate manipulation + weak signal = not worth showing
		if (sc.manipulation >= SOFT_VETO_M && sc.signal < SOFT_VETO_MAX_S) {
			return this.out("hide", "moderate_manipulation", "S1_MANIP", sc);
		}

		// Moderate template + weak signal = formulaic noise
		if (sc.template >= SOFT_VETO_T && sc.signal < SOFT_VETO_MAX_S) {
			return this.out("hide", "moderate_template", "S1_TEMPLATE", sc);
		}

		// ─── STEP 5: DEFAULT ───
		// When in doubt, show. Don't over-filter.
		return this.out("keep", "default_show", "K2_DEFAULT", sc);
	}

	private out(
		decision: Decision,
		reason: DecisionReason,
		ruleId: RuleId,
		sc: Scores,
	): ScoringOutput {
		const output: ScoringOutput = {
			decision,
			reason,
			ruleId,
			audit: {
				signal: sc.signal,
				manipulation: sc.manipulation,
				template: sc.template,
			},
		};

		logger.info("slop_audit", {
			event: "audit_decision",
			decision: output.decision,
			rule: output.ruleId,
			reason: output.reason,
			signal: sc.signal.toFixed(2),
			manipulation: sc.manipulation.toFixed(2),
			template: sc.template.toFixed(2),
		});

		return output;
	}

	private clamp(v: number): number {
		return Math.max(0, Math.min(1, v));
	}
}
