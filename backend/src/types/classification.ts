import type { DecisionValue } from "../lib/domain-constants";

export type Decision = DecisionValue;

/**
 * Raw LLM score vector where each key is in [0, 1].
 */
export interface ScoreResult {
	signal: number;
	manipulation: number;
	template: number;
	[key: string]: number | undefined;
}
