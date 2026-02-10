import {
    ScoreResult,
    Decision,
} from "../types/classification";
import { logger } from "../lib/logger";

// =========================================================
// CONSTANTS & THRESHOLDS
// =========================================================

// Filter 1: Safety / Toxic Veto
const THRESHOLD_TOXIC_RB = 0.6; // Rage bait
const THRESHOLD_TOXIC_X = 0.6;  // Deception/Lies

// Filter 2: Spam Veto
const THRESHOLD_SPAM_SP = 0.6;  // Sales pitch

// Filter 3: High Signal Rescue
const THRESHOLD_SIGNAL_U = 0.6; // Utility
const THRESHOLD_SIGNAL_D = 0.6; // Depth

// Filter 4: Human Connection Rescue
const THRESHOLD_HUMAN_C = 0.6;  // Authentic connection
const MAX_TOXIC_LOAD_FOR_HUMAN = 1.2; // (rb + eb + sp) must be below this

// Filter 5: Slop Trap (Annoyance)
const THRESHOLD_SLOP_TS = 0.8;  // Template slop (Viral bro)
const THRESHOLD_SLOP_EB = 0.6;  // Ego bait (Humblebrag)
const THRESHOLD_SLOP_SF = 0.6;  // Spammy formatting (Emoji wall)

// =========================================================
// TYPE DEFINITIONS
// =========================================================

type ScoreMap = Record<string, number>;

export type DecisionReason =
    | "toxic_content"
    | "aggressive_sales"
    | "high_signal"
    | "genuine_human"
    | "template_slop"
    | "ego_noise"
    | "formatting_noise"
    | "neutral_safe"
    | "error";

export type RuleId =
    | "H1_TOXIC"
    | "H2_SPAM"
    | "K1_SIGNAL"
    | "K2_HUMAN"
    | "H3_SLOP"
    | "D1_EGO"
    | "D2_FORMAT"
    | "K3_NEUTRAL"
    | "E0_ERROR";

export type ScoringOutput = {
    decision: Decision;
    reason: DecisionReason;
    ruleId: RuleId;
    audit: {
        valueScore: number; // The highest positive signal found
        slopScore: number;  // The highest negative signal found
        clampedScores: ScoreMap;
    };
};

export class ScoringEngine {

    public score(result: ScoreResult | null): ScoringOutput {
        // 0. Handle Null
        if (!result) {
            return this.buildOutput("keep", "error", "E0_ERROR", {}, 0, 0);
        }

        // 1. Sanitize Inputs (Clamp 0..1)
        const s = this.sanitize(result);

        // 2. Calculate Aggregates for Audit
        // We use the MAXIMUM signal found to represent "Potential Value"
        // We use the MAXIMUM noise found to represent "Potential Slop"
        // This ensures the UI always shows the true peak stats of the post.
        const maxSignal = Math.max(s.u, s.d, s.c);
        const maxNoise = Math.max(s.rb, s.sp, s.ts, s.eb, s.sf, s.x);

        // 3. Execute Independent Filters (The Waterfall)

        // --- Filter 1: TOXIC VETO (Safety) ---
        if (s.rb >= THRESHOLD_TOXIC_RB) {
            return this.buildOutput("hide", "toxic_content", "H1_TOXIC", s, maxNoise, maxSignal);
        }
        if (s.x >= THRESHOLD_TOXIC_X) {
            return this.buildOutput("hide", "toxic_content", "H1_TOXIC", s, maxNoise, maxSignal);
        }

        // --- Filter 2: SPAM VETO (Focus) ---
        if (s.sp >= THRESHOLD_SPAM_SP) {
            return this.buildOutput("hide", "aggressive_sales", "H2_SPAM", s, maxNoise, maxSignal);
        }

        // --- Filter 3: SIGNAL RESCUE (Utility) ---
        if (s.u >= THRESHOLD_SIGNAL_U || s.d >= THRESHOLD_SIGNAL_D) {
            return this.buildOutput("keep", "high_signal", "K1_SIGNAL", s, maxNoise, maxSignal);
        }

        // --- Filter 4: HUMAN RESCUE (Community) ---
        const toxicLoad = s.rb + s.eb + s.sp;
        if (s.c >= THRESHOLD_HUMAN_C && toxicLoad < MAX_TOXIC_LOAD_FOR_HUMAN) {
            return this.buildOutput("keep", "genuine_human", "K2_HUMAN", s, maxNoise, maxSignal);
        }

        // --- Filter 5: SLOP TRAP (Annoyance) ---

        // 5a. Template Slop (Hide)
        if (s.ts >= THRESHOLD_SLOP_TS) {
            return this.buildOutput("hide", "template_slop", "H3_SLOP", s, maxNoise, maxSignal);
        }

        // 5b. Ego Bait (Hide)
        if (s.eb >= THRESHOLD_SLOP_EB) {
            return this.buildOutput("hide", "ego_noise", "D1_EGO", s, maxNoise, maxSignal);
        }

        // 5c. Spammy Formatting (Hide)
        if (s.sf >= THRESHOLD_SLOP_SF) {
            return this.buildOutput("hide", "formatting_noise", "D2_FORMAT", s, maxNoise, maxSignal);
        }

        // --- Filter 6: DEFAULT (Neutral) ---
        return this.buildOutput("keep", "neutral_safe", "K3_NEUTRAL", s, maxNoise, maxSignal);
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
                valueScore, // Now reflects the actual Max Signal
                slopScore,  // Now reflects the actual Max Noise
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
        const keys = ["u", "d", "c", "h", "rb", "eb", "sp", "ts", "sf", "x"];

        for (const k of keys) {
            const val = result[k as keyof ScoreResult] ?? 0;
            clamped[k] = Math.max(0, Math.min(1, val));
        }
        return clamped;
    }
}
