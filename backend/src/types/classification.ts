export type Decision = "keep" | "dim" | "hide";

/**
 * ScoreResult: The raw signals from the LLM.
 * All values are 0.0 - 1.0.
 */
export interface ScoreResult {
    u: number;
    d: number;
    c: number;
    h: number;
    rb: number;
    eb: number;
    sp: number;
    ts: number;
    sf: number;
    x: number;

    // This is the fix: The Index Signature
    [key: string]: number | undefined;
}