import { normalizeContentText } from "../../lib/hash";

/**
 * LinkedIn cleanup uses deterministic edge peeling:
 * 1) normalize separator/token artifacts (for example "|" and glued metadata),
 * 2) peel leading metadata/prefix noise,
 * 3) peel trailing action/count noise,
 * 4) repeat bounded passes until stable.
 *
 * Design decisions:
 * - Edge-only mutation: remove noise only from start/end, never from the middle.
 * - Bounded convergence: run a small number of passes, stop early when unchanged.
 * - Fail-open safety: if cleanup would over-strip, return normalized original text.
 */
type CleanupRule = readonly [pattern: RegExp, replacement: string];

const PROSE_PREFIX_DISALLOWED = new Set([
	"i",
	"we",
	"you",
	"they",
	"it",
	"this",
	"that",
	"our",
	"my",
]);

const TOPIC_BODY_START_GUARD = new Set([
	"i",
	"we",
	"you",
	"they",
	"it",
	"this",
	"that",
	"these",
	"those",
	"our",
	"my",
	"today",
	"here",
]);

const FOLLOW_IMPERATIVE_GUARD = new Set([
	"me",
	"us",
	"you",
	"this",
	"that",
	"these",
	"those",
	"my",
	"our",
	"your",
	"up",
	"along",
]);

const MAX_EDGE_PASSES = 6;
const MAX_PREFIX_SCAN_TOKENS = 20;
const MAX_ACTOR_TOKENS = 12;
const MIN_ACTOR_TOKENS = 2;
const MIN_BODY_TOKENS_AFTER_PREFIX = 4;

const NORMALIZE_RULES: CleanupRule[] = [
	[/\u2026more/gi, "...more"],
	[/\s*\|\s*/g, " "],
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
	[/(?:\.\.\.more|\u2026more)\b[\s\S]*$/i, ""],
	[/\blike\s+comment\s+congratulations!?[\s\S]*$/i, ""],
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

function applyRulePass(value: string, rules: CleanupRule[]): string {
	let current = value.trim();
	for (const [pattern, replacement] of rules) {
		current = current.replace(pattern, replacement).trim();
	}

	return current;
}

function splitTokens(value: string): string[] {
	return value.trim().split(/\s+/).filter(Boolean);
}

function canonicalToken(token: string): string {
	return token.replace(/^[^a-z0-9]+|[^a-z0-9]+$/gi, "").toLowerCase();
}

function isCountToken(token: string): boolean {
	return /^(?:\d{1,3}(?:,\d{3})+|\d+)$/.test(token);
}

function stripLeadingFollowActionPrefix(value: string): string {
	const tokens = splitTokens(value);
	if (tokens.length < MIN_BODY_TOKENS_AFTER_PREFIX + 1) {
		return value;
	}

	const first = canonicalToken(tokens[0] ?? "");
	if (first !== "follow") {
		return value;
	}

	const second = canonicalToken(tokens[1] ?? "");
	if (FOLLOW_IMPERATIVE_GUARD.has(second)) {
		return value;
	}

	const remainingTokenCount = tokens.length - 1;
	if (remainingTokenCount < MIN_BODY_TOKENS_AFTER_PREFIX) {
		return value;
	}

	return tokens.slice(1).join(" ");
}

function consumeLinkedInTopicTokens(
	tokens: string[],
	startIndex: number,
): number {
	if (startIndex >= tokens.length) {
		return 0;
	}

	const first = canonicalToken(tokens[startIndex]);
	if (first !== "linkedin") {
		return 0;
	}

	const second = canonicalToken(tokens[startIndex + 1] ?? "");
	const third = canonicalToken(tokens[startIndex + 2] ?? "");

	if (second === "for" && third && !TOPIC_BODY_START_GUARD.has(third)) {
		return 3;
	}

	if (second && !TOPIC_BODY_START_GUARD.has(second)) {
		return 2;
	}

	return 0;
}

function hasValidActorPrefix(
	tokens: string[],
	actorTokenCount: number,
): boolean {
	if (
		actorTokenCount < MIN_ACTOR_TOKENS ||
		actorTokenCount > MAX_ACTOR_TOKENS
	) {
		return false;
	}

	const first = canonicalToken(tokens[0] ?? "");
	return first.length > 0 && !PROSE_PREFIX_DISALLOWED.has(first);
}

function stripLeadingFollowMetadataPrefix(value: string): string {
	const tokens = splitTokens(value);
	if (tokens.length < 8) {
		return value;
	}

	const scanLimit = Math.min(tokens.length, MAX_PREFIX_SCAN_TOKENS);
	for (let index = 0; index < scanLimit; index += 1) {
		const token = canonicalToken(tokens[index]);
		const isFollowToken = token === "follow" || token === "follows";
		if (!isFollowToken) {
			continue;
		}

		let actorTokenCount = -1;
		let topicTokenStart = index + 1;

		const hasConnectionsShape =
			index >= 4 &&
			canonicalToken(tokens[index - 1]) === "connections" &&
			canonicalToken(tokens[index - 2]) === "other" &&
			isCountToken(canonicalToken(tokens[index - 3])) &&
			canonicalToken(tokens[index - 4]) === "and";

		if (hasConnectionsShape) {
			actorTokenCount = index - 4;
		} else {
			actorTokenCount = index;
		}

		if (!hasValidActorPrefix(tokens, actorTokenCount)) {
			continue;
		}

		const topicTokenCount = consumeLinkedInTopicTokens(tokens, topicTokenStart);
		if (topicTokenCount === 0) {
			continue;
		}

		const bodyStart = topicTokenStart + topicTokenCount;
		const bodyTokenCount = tokens.length - bodyStart;
		if (bodyTokenCount < MIN_BODY_TOKENS_AFTER_PREFIX) {
			continue;
		}

		return tokens.slice(bodyStart).join(" ");
	}

	return value;
}

function stripLeadingEdgeNoise(value: string): string {
	const withoutFollowAction = stripLeadingFollowActionPrefix(value);
	const withoutFollowMetadata =
		stripLeadingFollowMetadataPrefix(withoutFollowAction);
	return applyRulePass(withoutFollowMetadata, LEADING_RULES);
}

function stripTrailingEdgeNoise(value: string): string {
	return applyRulePass(value, TRAILING_RULES);
}

function peelEdges(value: string): string {
	let current = value.trim();
	for (let pass = 0; pass < MAX_EDGE_PASSES && current.length > 0; pass += 1) {
		const previous = current;
		current = stripLeadingEdgeNoise(current);
		current = stripTrailingEdgeNoise(current);
		if (current === previous) {
			break;
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

	const harmonized = applyRulePass(normalized, NORMALIZE_RULES);
	const peeled = peelEdges(harmonized);

	if (!peeled) {
		return "";
	}

	return shouldFallbackToNormalized(peeled, harmonized) ? harmonized : peeled;
}
