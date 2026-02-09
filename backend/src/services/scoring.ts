import {
    ScoreResult,
    Decision,
} from "../types/classification";
import { logger } from "../lib/logger";

// =========================================================
// CONSTANTS & THRESHOLDS
// =========================================================

// Filter 1: Safety / Toxic Veto
const THRESHOLD_TOXIC_RB = 0.7; // Rage bait
const THRESHOLD_TOXIC_X = 0.7;  // Deception/Lies

// Filter 2: Spam Veto
const THRESHOLD_SPAM_SP = 0.8;  // Sales pitch

// Filter 3: High Signal Rescue
const THRESHOLD_SIGNAL_U = 0.8; // Utility
const THRESHOLD_SIGNAL_D = 0.8; // Depth

// Filter 4: Human Connection Rescue
const THRESHOLD_HUMAN_C = 0.7;  // Authentic connection
const MAX_TOXIC_LOAD_FOR_HUMAN = 1.2; // (rb + eb + sp) must be below this

// Filter 5: Slop Trap (Annoyance)
const THRESHOLD_SLOP_TS = 0.7;  // Template slop (Viral bro)
const THRESHOLD_SLOP_EB = 0.7;  // Ego bait (Humblebrag)
const THRESHOLD_SLOP_SF = 0.8;  // Spammy formatting (Emoji wall)

// =========================================================
// TYPE DEFINITIONS
// =========================================================

type ScoreMap = Record<string, number>;

// Extending the contract to support granular auditing reasons
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
    ladder: number; // Retained for sorting/viz compatibility
    audit: {
        valueScore: number; // Calculated for UI reference
        slopScore: number;  // Calculated for UI reference
        clampedScores: ScoreMap;
    };
};

export class ScoringEngine {

    public score(result: ScoreResult | null): ScoringOutput {
        // 0. Handle Null
        if (!result) {
            return this.buildOutput("keep", "error", "E0_ERROR", 0, {}, 0, 0);
        }

        // 1. Sanitize Inputs (Clamp 0..1)
        const s = this.sanitize(result);

        // 2. Execute Independent Filters (The Waterfall)

        // --- Filter 1: TOXIC VETO (Safety) ---
        // Immediate Hide: Rage bait or Deception
        if (s.rb >= THRESHOLD_TOXIC_RB) {
            return this.buildOutput("hide", "toxic_content", "H1_TOXIC", 0.0, s, s.rb, 0);
        }
        if (s.x >= THRESHOLD_TOXIC_X) {
            return this.buildOutput("hide", "toxic_content", "H1_TOXIC", 0.0, s, s.x, 0);
        }

        // --- Filter 2: SPAM VETO (Focus) ---
        // Immediate Hide: Hard sales funnels
        if (s.sp >= THRESHOLD_SPAM_SP) {
            return this.buildOutput("hide", "aggressive_sales", "H2_SPAM", 0.1, s, s.sp, 0);
        }

        // --- Filter 3: SIGNAL RESCUE (Utility) ---
        // Immediate Keep: High Utility or Depth (Redeems bad formatting/ego)
        if (s.u >= THRESHOLD_SIGNAL_U || s.d >= THRESHOLD_SIGNAL_D) {
            const val = Math.max(s.u, s.d);
            return this.buildOutput("keep", "high_signal", "K1_SIGNAL", 1.0, s, 0, val);
        }

        // --- Filter 4: HUMAN RESCUE (Community) ---
        // Keep: Genuine connection, providing it's not secretly toxic
        const toxicLoad = s.rb + s.eb + s.sp;
        if (s.c >= THRESHOLD_HUMAN_C && toxicLoad < MAX_TOXIC_LOAD_FOR_HUMAN) {
            return this.buildOutput("keep", "genuine_human", "K2_HUMAN", 0.9, s, 0, s.c);
        }

        // --- Filter 5: SLOP TRAP (Annoyance) ---
        // Checks for low-value noise.

        // 5a. Template Slop (Hide) - The "Viral Bro" style
        if (s.ts >= THRESHOLD_SLOP_TS) {
            return this.buildOutput("hide", "template_slop", "H3_SLOP", 0.2, s, s.ts, 0);
        }

        // 5b. Ego Bait (Dim) - The "Humblebrag"
        if (s.eb >= THRESHOLD_SLOP_EB) {
            return this.buildOutput("dim", "ego_noise", "D1_EGO", 0.4, s, s.eb, 0);
        }

        // 5c. Spammy Formatting (Dim) - The "Wall of Emojis"
        if (s.sf >= THRESHOLD_SLOP_SF) {
            return this.buildOutput("dim", "formatting_noise", "D2_FORMAT", 0.4, s, s.sf, 0);
        }

        // --- Filter 6: DEFAULT (Neutral) ---
        // If it survives the filters, it's normal content.
        return this.buildOutput("keep", "neutral_safe", "K3_NEUTRAL", 0.6, s, 0.1, 0.5);
    }

    /**
     * Helper to construct the output object and log the decision.
     */
    private buildOutput(
        decision: Decision,
        reason: DecisionReason,
        ruleId: RuleId,
        ladderProxy: number,
        clampedScores: ScoreMap,
        debugSlop: number,
        debugValue: number
    ): ScoringOutput {

        const out: ScoringOutput = {
            decision,
            reason,
            ruleId,
            ladder: ladderProxy, // Proxy value for UI sorting (0=Toxic, 1=High Value)
            audit: {
                valueScore: debugValue, // Just for UI reference
                slopScore: debugSlop,   // Just for UI reference
                clampedScores,
            },
        };

        logger.info("slop_audit", {
            event: "audit_decision",
            decision: out.decision,
            rule: out.ruleId,
            reason: out.reason,
            scores: JSON.stringify(clampedScores)
        });

        return out;
    }

    /**
     * Clamps all inputs to 0-1 range to prevent math errors.
     */
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