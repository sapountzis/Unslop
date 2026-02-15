import type { DecisionValue } from "../lib/domain-constants";

export type Decision = DecisionValue;

/**
 * Raw LLM score vector where each key is in [0, 1].
 */
export interface ScoreResult {
	u: number;
	d: number;
	c: number;
	rb: number;
	eb: number;
	sp: number;
	p: number;
	x: number;
	[key: string]: number | undefined;
}
