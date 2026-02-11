import {
    ScoreResult,
    Decision,
} from "../types/classification";
import { logger } from "../lib/logger";

// =========================================================
// THRESHOLDS — each independently tunable
// =========================================================

// Step 1: Hard Vetoes (extreme values, always hide)
const HARD_VETO_RB = 0.7;   // Rage bait
const HARD_VETO_X = 0.7;    // Deception
const HARD_VETO_SP = 0.8;   // Pure sales funnel

// Step 2: Signal Rescue — safety gate
const RESCUE_GATE_RB = 0.5; // Max rb allowed for rescue
const RESCUE_GATE_X = 0.5;  // Max x allowed for rescue
const RESCUE_U = 0.6;       // Usefulness rescue threshold
const RESCUE_D = 0.6;       // Depth rescue threshold
const RESCUE_C = 0.6;       // Connection rescue threshold

// Step 3: Soft Vetoes (moderate negatives, no redeeming signal)
const SOFT_VETO_RB = 0.5;   // Moderate rage bait
const SOFT_VETO_X = 0.5;    // Moderate deception
const SOFT_VETO_SP = 0.5;   // Moderate sales pitch
const SOFT_VETO_P = 0.7;    // Packaging slop
const SOFT_VETO_EB = 0.6;   // Ego noise

// =========================================================
// TYPE DEFINITIONS
// =========================================================

type ScoreMap = Record<string, number>;

export type DecisionReason =
    | "toxic_content"
    | "deception"
    | "aggressive_sales"
    | "high_signal"
    | "genuine_human"
    | "rage_bait"
    | "misleading"
    | "sales_pitch"
    | "packaging_slop"
    | "ego_noise"
    | "neutral_safe"
    | "error";

export type RuleId =
    | "H1_RAGE"
    | "H1_DECEPTION"
    | "H1_SALES"
    | "K1_SIGNAL"
    | "K1_HUMAN"
    | "S1_RAGE"
    | "S1_DECEPTION"
    | "S1_SALES"
    | "S1_PACKAGING"
    | "S1_EGO"
    | "K2_NEUTRAL"
    | "E0_ERROR";

export type ScoringOutput = {
    decision: Decision;
    reason: DecisionReason;
    ruleId: RuleId;
    audit: {
        valueScore: number;
        slopScore: number;
        clampedScores: ScoreMap;
    };
};

const DIMENSION_KEYS = ["u", "d", "c", "rb", "eb", "sp", "p", "x"] as const;

export class ScoringEngine {

    public score(result: ScoreResult | null): ScoringOutput {
        // 0. Handle Null
        if (!result) {
            return this.buildOutput("keep", "error", "E0_ERROR", {}, 0, 0);
        }

        // 1. Sanitize Inputs (Clamp 0..1)
        const s = this.sanitize(result);

        // 2. Calculate Aggregates for Audit
        const maxSignal = Math.max(s.u, s.d, s.c);
        const maxNoise = Math.max(s.rb, s.sp, s.p, s.eb, s.x);

        // ─── STEP 1: HARD VETOES (extreme values, always hide) ───

        if (s.rb >= HARD_VETO_RB) {
            return this.buildOutput("hide", "toxic_content", "H1_RAGE", s, maxNoise, maxSignal);
        }
        if (s.x >= HARD_VETO_X) {
            return this.buildOutput("hide", "deception", "H1_DECEPTION", s, maxNoise, maxSignal);
        }
        if (s.sp >= HARD_VETO_SP) {
            return this.buildOutput("hide", "aggressive_sales", "H1_SALES", s, maxNoise, maxSignal);
        }

        // ─── STEP 2: SIGNAL RESCUE (with safety gate) ───
        // Only rescue if rage and deception are below the safety gate.
        // This prevents "useful but ragey/deceptive" content from passing.

        const safetyGatePasses = s.rb < RESCUE_GATE_RB && s.x < RESCUE_GATE_X;

        if (safetyGatePasses) {
            if (s.u >= RESCUE_U || s.d >= RESCUE_D) {
                return this.buildOutput("keep", "high_signal", "K1_SIGNAL", s, maxNoise, maxSignal);
            }
            if (s.c >= RESCUE_C) {
                return this.buildOutput("keep", "genuine_human", "K1_HUMAN", s, maxNoise, maxSignal);
            }
        }

        // ─── STEP 3: SOFT VETOES (moderate negatives, no redeeming signal) ───

        if (s.rb >= SOFT_VETO_RB) {
            return this.buildOutput("hide", "rage_bait", "S1_RAGE", s, maxNoise, maxSignal);
        }
        if (s.x >= SOFT_VETO_X) {
            return this.buildOutput("hide", "misleading", "S1_DECEPTION", s, maxNoise, maxSignal);
        }
        if (s.sp >= SOFT_VETO_SP) {
            return this.buildOutput("hide", "sales_pitch", "S1_SALES", s, maxNoise, maxSignal);
        }
        if (s.p >= SOFT_VETO_P) {
            return this.buildOutput("hide", "packaging_slop", "S1_PACKAGING", s, maxNoise, maxSignal);
        }
        if (s.eb >= SOFT_VETO_EB) {
            return this.buildOutput("hide", "ego_noise", "S1_EGO", s, maxNoise, maxSignal);
        }

        // ─── STEP 4: DEFAULT ───

        return this.buildOutput("keep", "neutral_safe", "K2_NEUTRAL", s, maxNoise, maxSignal);
    }

    /**
     * Helper to construct the output object and log the decision.
     */
    private buildOutput(
        decision: Decision,
        reason: DecisionReason,
        ruleId: RuleId,
        clampedScores: ScoreMap,
        slopScore: number,
        valueScore: number
    ): ScoringOutput {

        const out: ScoringOutput = {
            decision,
            reason,
            ruleId,
            audit: {
                valueScore,
                slopScore,
                clampedScores,
            },
        };

        logger.info("slop_audit", {
            event: "audit_decision",
            decision: out.decision,
            rule: out.ruleId,
            reason: out.reason,
            maxSignal: valueScore.toFixed(2),
            maxNoise: slopScore.toFixed(2)
        });

        return out;
    }

    private sanitize(result: ScoreResult): ScoreMap {
        const clamped: ScoreMap = {};

        for (const k of DIMENSION_KEYS) {
            const val = result[k as keyof ScoreResult] ?? 0;
            clamped[k] = Math.max(0, Math.min(1, val));
        }
        return clamped;
    }
}
