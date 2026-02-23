import { normalizeContentText } from "../../lib/hash";

type CleanupRule = readonly [pattern: RegExp, replacement: string];

const NORMALIZE_RULES: CleanupRule[] = [
	[/\u2026more/gi, "...more"],
	[/\bfollowingverified\b/gi, "following verified"],
	[/\bfollowers(?=\d)/gi, "followers "],
	[/\bfollowersfollowers\b/gi, "followers"],
	[/\bpromotedpromoted\b/gi, "promoted"],
	[/\s*•\s*/g, " • "],
];

const LEADING_RULES: CleanupRule[] = [
	[/^feed post number \d+\s*/i, ""],
	[
		/^[a-z0-9][a-z0-9 .,'&/@|+-]{0,180}\s(?:loves this|likes this|liked this|commented on this|reposted this)\s*/i,
		"",
	],
	[/^[^.!?]{0,500}\bvisible to anyone on or off linkedin\b\s*/i, ""],
	[/^([a-z0-9][a-z0-9 .,'&/@|+-]{1,80}?)\1(?=(?:\s|•|$))/i, "$1"],
	[/^[a-z0-9][a-z0-9 .,'&/@|+-]{0,140}(?:'|\u2019)s?\s+job update\s*/i, ""],
	[/^job update\s*/i, ""],
	[
		/^[a-z0-9][a-z0-9 .,'&/@|+-]{0,120}\s+(?=(?:\d{1,3}(?:,\d{3})+|\d+)\s+followers?\b)/i,
		"",
	],
	[/^(?:\d{1,3}(?:,\d{3})+|\d+)\s+followers?\s*/i, ""],
	[
		/^(?:following verified|verified following|following|verified)(?:\s*•\s*(?:following verified|verified following|following|verified))*\s*/i,
		"",
	],
	[
		/^(?:\d+\s*[smhdw]|(?:\d+)\s+(?:seconds?|minutes?|hours?|days?|weeks?|months?|years?)\s+ago)\s*/i,
		"",
	],
	[/^promoted\s*/i, ""],
	[/^(?:•\s*)+/i, ""],
];

const TRAILING_RULES: CleanupRule[] = [
	[/\blike\s+comment\s+congratulations!?[\s\S]*$/i, ""],
	[/(?:\.\.\.more|\u2026more)\b[\s\S]*$/i, ""],
	[/\byour document is loading\b[\s\S]*$/i, ""],
	[/\bdownload free whitepaper\b[\s\S]*$/i, ""],
	[/\bview form\b[\s\S]*$/i, ""],
	[/\b\d+\s+\d+\s+comments?\b(?:\s+\d+\s+reposts?)?\s*$/i, ""],
	[/\b\d+\s+comments?\s+\d+\s+reposts?\b\s*$/i, ""],
	[/\b\d+\s+reposts?\b\s*$/i, ""],
	[/\b\d+\s+reactions?\b\s*$/i, ""],
	[/\b\d+\s+comments?\b\s*$/i, ""],
	[/\bload more comments\b\s*$/i, ""],
	[
		/\b(?:like|comment|reply|repost|send)(?:\s+(?:like|comment|reply|repost|send)){1,}\s*$/i,
		"",
	],
	[/(?:\s*[•|]\s*)+$/i, ""],
];

function applyRules(value: string, rules: CleanupRule[]): string {
	let current = value.trim();
	let mutated = true;

	while (mutated && current.length > 0) {
		mutated = false;
		for (const [pattern, replacement] of rules) {
			const next = current.replace(pattern, replacement).trim();
			if (next !== current) {
				current = next;
				mutated = true;
			}
		}
	}

	return current;
}

function tokenCount(value: string): number {
	const matches = value.match(/[a-z0-9]+/g);
	return matches ? matches.length : 0;
}

function shouldFallbackToNormalized(
	cleaned: string,
	normalized: string,
): boolean {
	const normalizedTokens = tokenCount(normalized);
	const cleanedTokens = tokenCount(cleaned);
	if (normalizedTokens < 8) {
		return false;
	}

	return cleanedTokens <= 2 && cleaned.length < normalized.length * 0.2;
}

export function cleanupLinkedInText(rawText: string): string {
	if (!rawText) {
		return "";
	}

	const normalized = normalizeContentText(rawText);
	if (!normalized) {
		return "";
	}

	const harmonized = applyRules(normalized, NORMALIZE_RULES);
	const withoutLeadingNoise = applyRules(harmonized, LEADING_RULES);
	const withoutTrailingNoise = applyRules(withoutLeadingNoise, TRAILING_RULES);

	if (!withoutTrailingNoise) {
		return "";
	}

	return shouldFallbackToNormalized(withoutTrailingNoise, harmonized)
		? harmonized
		: withoutTrailingNoise;
}
