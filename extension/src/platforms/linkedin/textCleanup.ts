import { normalizeContentText } from "../../lib/hash";

/**
 * LinkedIn text cleanup is intentionally staged:
 * 1) normalize known token-glue artifacts from DOM extraction,
 * 2) strip leading metadata/header UI noise,
 * 3) strip trailing action/count UI noise,
 * 4) preserve fail-open behavior when aggressive stripping would leave almost no text.
 *
 * The follow-prefix cleaner is token-based (instead of one broad regex) because
 * follow metadata can be glued into prefix text and naive regex tends to either
 * miss variants or over-strip body content. The token strategy keeps filtering
 * deterministic and scoped to known LinkedIn follow-topic shapes.
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

const MAX_PREFIX_SCAN_TOKENS = 20;
const MAX_ACTOR_TOKENS = 12;
const MIN_ACTOR_TOKENS = 2;
const MIN_BODY_TOKENS_AFTER_PREFIX = 4;

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

function canonicalToken(token: string): string {
	return token.replace(/^[^a-z0-9]+|[^a-z0-9]+$/gi, "").toLowerCase();
}

function isCountToken(token: string): boolean {
	return /^(?:\d{1,3}(?:,\d{3})+|\d+)$/.test(token);
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

function stripLeadingFollowPrefix(value: string): string {
	const tokens = value.trim().split(/\s+/).filter(Boolean);
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
	const withoutFollowPrefix = stripLeadingFollowPrefix(harmonized);
	const withoutLeadingNoise = applyRules(withoutFollowPrefix, LEADING_RULES);
	const withoutTrailingNoise = applyRules(withoutLeadingNoise, TRAILING_RULES);

	if (!withoutTrailingNoise) {
		return "";
	}

	return shouldFallbackToNormalized(withoutTrailingNoise, harmonized)
		? harmonized
		: withoutTrailingNoise;
}
