

import {
    ScoreResult,
    Decision,
} from "../types/classification";
import { logger } from "../lib/logger";

/**
 * ScoringEngine
 * * Logic:
 * 1. Sanitize: Ensure all inputs are 0..1.
 * 2. Group: Separate "Value" signals from "Slop" signals.
 * 3. Aggregate (Power Mean): Use Root Mean Square to ensure strong signals 
 * aren't diluted by low-signal dimensions.
 * 4. Ladder: Compute a final 0..1 score by pitting Value against Slop.
 */

const KEEP_THRESHOLD = 0.4;
const DIM_THRESHOLD = 0.4;

type ScoreMap = Record<string, number>;

export type ScoringOutput = {
    decision: Decision;
    reason: "ladder_keep" | "ladder_dim" | "ladder_hide" | "error";
    ruleId: "K0_LADDER" | "D0_LADDER" | "H0_LADDER" | "E0_ERROR";
    ladder: number;
    audit: {
        valueScore: number;
        slopScore: number;
        clampedScores: ScoreMap;
    };
};

export class ScoringEngine {
    // 'h' (humor) moved to value/neutral to avoid penalizing personality.
    private readonly valueKeys = ["u", "d", "c", "h"];
    private readonly slopKeys = ["sp", "ts", "sf", "rb", "eb", "x"];

    public score(result: ScoreResult | null): ScoringOutput {
        if (!result) {
            return {
                decision: "keep",
                reason: "error",
                ruleId: "E0_ERROR",
                ladder: 0,
                audit: {
                    valueScore: 0,
                    slopScore: 0,
                    clampedScores: {},
                },
            };
        }
        const clamped: ScoreMap = {};

        // 1. Sanitize
        const allKeys = ["u", "d", "c", "h", "rb", "eb", "sp", "ts", "sf", "x"] as const;

        for (const key of allKeys) {
            clamped[key] = this.clamp01(result[key as keyof ScoreResult] ?? 0);
        }
        // 2. Aggregate using Power Mean (p=2 / RMS)
        // This ensures that if ONE slop signal is very high (e.g., 0.9), 
        // it isn't "diluted" to 0.1 by other empty dimensions.
        const vScore = this.powerMean(this.valueKeys.map(k => clamped[k]));
        const sScore = this.powerMean(this.slopKeys.map(k => clamped[k]));

        // 3. The Ladder Calculation
        // We want a high ladder score (towards 1.0) to mean "Keep".
        // Formula: 0.5 + (Value - Slop) / 2
        // If Value is 1 and Slop is 0 -> Ladder is 1.0
        // If Value is 0 and Slop is 1 -> Ladder is 0.0
        const ladder = this.clamp01(0.5 + (vScore - sScore) / 2);

        const { decision, reason, ruleId } = this.decisionFromLadder(ladder);

        const out: ScoringOutput = {
            decision,
            reason,
            ruleId,
            ladder,
            audit: {
                valueScore: vScore,
                slopScore: sScore,
                clampedScores: clamped,
            },
        };

        logger.info("slop_decision", {
            event: "slop_decision",
            decision: out.decision,
            ladder: out.ladder.toFixed(3),
            v: vScore.toFixed(3),
            s: sScore.toFixed(3),
        }
        );

        return out;
    }

    /**
     * Power Mean (RMS)
     * Higher p-values make the result more sensitive to the "peak" signal.
     * At p=2, it's a smooth way to say "if any of these are high, the group is high."
     */
    private powerMean(xs: number[]): number {
        if (xs.length === 0) return 0;
        const sumSq = xs.reduce((acc, x) => acc + (x * x), 0);
        return Math.sqrt(sumSq / xs.length);
    }

    private decisionFromLadder(ladder: number): {
        decision: Decision;
        reason: ScoringOutput["reason"];
        ruleId: ScoringOutput["ruleId"];
    } {
        if (ladder >= KEEP_THRESHOLD) {
            return { decision: "keep", reason: "ladder_keep", ruleId: "K0_LADDER" };
        }
        if (ladder >= DIM_THRESHOLD) {
            return { decision: "dim", reason: "ladder_dim", ruleId: "D0_LADDER" };
        }
        return { decision: "hide", reason: "ladder_hide", ruleId: "H0_LADDER" };
    }

    private clamp01(x: number): number {
        return Math.max(0, Math.min(1, x));
    }
}
