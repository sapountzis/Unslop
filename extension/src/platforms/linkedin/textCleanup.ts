import { normalizeContentText } from "../../lib/hash";

/**
 * LinkedIn cleanup pipeline (DOM-structure independent):
 * 1) normalize known token/separator artifacts,
 * 2) hard-truncate obvious trailing UI tails (for example "...more"),
 * 3) peel metadata only from text edges using bounded passes,
 * 4) classify result as content / metadata-only / uncertain.
 *
 * Design goals:
 * - Deterministic: every stage is explicit and idempotent.
 * - Edge-only stripping: no mutation of middle-body prose.
 * - Fail-open for uncertainty: keep normalized text only when we cannot
 *   prove it is metadata-only.
 */
type CleanupRule = readonly [pattern: RegExp, replacement: string];

type FollowPrefixParse = {
	bodyStartTokenIndex: number | null;
};

export type LinkedInCleanupClassification =
	| "content"
	| "metadata_only"
	| "uncertain";

export type LinkedInCleanupOutcome = {
	text: string;
	classification: LinkedInCleanupClassification;
};

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

const BODY_START_SINGLE_CUES = new Set([
	"today",
	"here",
	"join",
	"hiring",
	"looking",
	"announcing",
	"sharing",
	"proud",
	"thrilled",
	"excited",
	"new",
	"just",
	"check",
	"read",
	"learn",
	"ready",
	"link",
	"hashtag",
]);

const BODY_START_PRONOUNS = new Set([
	"i",
	"we",
	"you",
	"they",
	"it",
	"this",
	"that",
	"these",
	"those",
]);

const BODY_START_AFTER_PRONOUN = new Set([
	"am",
	"are",
	"is",
	"was",
	"were",
	"have",
	"had",
	"will",
	"can",
	"did",
	"do",
	"need",
	"want",
	"launched",
	"launching",
	"built",
	"building",
	"hiring",
	"looking",
	"sharing",
	"announcing",
	"posted",
	"post",
]);

const METADATA_STATUS_TOKENS = new Set([
	"following",
	"verified",
	"promoted",
	"edited",
]);

const MAX_EDGE_PASSES = 6;
const MAX_PREFIX_SCAN_TOKENS = 20;
const MAX_ACTOR_TOKENS = 12;
const MIN_ACTOR_TOKENS = 2;
const MIN_BODY_TOKENS_AFTER_PREFIX = 4;
const MIN_BODY_TOKENS_AFTER_FOLLOW_ACTIVITY = 3;
const MIN_FOLLOW_TARGET_TOKENS = 2;
const MAX_FOLLOW_TARGET_TOKENS = 10;

const TIME_ANCHOR_REGEX =
	/\b(?:just now|\d{1,3}\s*(?:s|m|h|d|w|mo)|\d{1,3}\s+(?:seconds?|minutes?|hours?|days?|weeks?|months?|years?)\s+ago)\b/i;

const NORMALIZE_RULES: CleanupRule[] = [
	[/\u2026more/gi, "...more"],
	[/\s*\|\s*/g, " • "],
	[/\bfollowingverified\b/gi, "following verified"],
	[/\bverifiedfollowing\b/gi, "verified following"],
	[/\b(\d+(?:st|nd|rd|th))verified\b/gi, "$1 verified"],
	[/\bverified(\d+(?:st|nd|rd|th))\b/gi, "verified $1"],
	[/\bfollowers(?=\d)/gi, "followers "],
	[/\bfollowersfollowers\b/gi, "followers"],
	[/\bpromotedpromoted\b/gi, "promoted"],
	[/\s*•\s*/g, " • "],
];

const LEADING_REGEX_RULES: CleanupRule[] = [
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
		/^(?:following|verified|promoted|edited|\d+(?:st|nd|rd|th))(?:\s*•\s*(?:following|verified|promoted|edited|\d+(?:st|nd|rd|th)))*\s*/i,
		"",
	],
	[
		/^(?:just now|\d+\s*(?:s|m|h|d|w|mo)|(?:\d+)\s+(?:seconds?|minutes?|hours?|days?|weeks?|months?|years?)\s+ago)\s*/i,
		"",
	],
	[/^promoted\s*/i, ""],
	[/^(?:•\s*)+/i, ""],
];

const TRAILING_REGEX_RULES: CleanupRule[] = [
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

function splitSegments(value: string): string[] {
	return value
		.split(/\s*•\s*/)
		.map((segment) => segment.trim())
		.filter(Boolean);
}

function joinSegments(segments: string[]): string {
	return segments.join(" • ").trim();
}

function canonicalToken(token: string): string {
	return token.replace(/^[^a-z0-9]+|[^a-z0-9]+$/gi, "").toLowerCase();
}

function tokenCount(value: string): number {
	const matches = value.match(/[a-z0-9]+/g);
	return matches ? matches.length : 0;
}

function isCountToken(token: string): boolean {
	return /^(?:\d{1,3}(?:,\d{3})+|\d+)$/.test(token);
}

function isConnectionDegreeToken(token: string): boolean {
	return /^\d+(?:st|nd|rd|th)$/.test(token);
}

function isTimeSegment(segment: string): boolean {
	return TIME_ANCHOR_REGEX.test(segment.trim());
}

function isLikelyActorSegment(segment: string): boolean {
	const tokens = splitTokens(segment).map(canonicalToken).filter(Boolean);
	if (tokens.length < 1 || tokens.length > MAX_ACTOR_TOKENS) {
		return false;
	}

	const first = tokens[0] ?? "";
	if (!first || PROSE_PREFIX_DISALLOWED.has(first)) {
		return false;
	}

	if (isCountToken(first) || isConnectionDegreeToken(first)) {
		return false;
	}

	return true;
}

function isIdentityMetadataSegment(segment: string): boolean {
	const trimmed = segment.trim();
	if (!trimmed) {
		return false;
	}

	if (isTimeSegment(trimmed)) {
		return true;
	}

	if (/^(?:\d{1,3}(?:,\d{3})+|\d+)\s+followers?$/i.test(trimmed)) {
		return true;
	}

	const tokens = splitTokens(trimmed).map(canonicalToken).filter(Boolean);
	if (tokens.length === 0) {
		return false;
	}

	for (const token of tokens) {
		if (METADATA_STATUS_TOKENS.has(token)) {
			continue;
		}
		if (isConnectionDegreeToken(token)) {
			continue;
		}
		return false;
	}

	return true;
}

function looksLikeMetadataPrefix(prefix: string): boolean {
	const trimmed = prefix.trim();
	if (!trimmed) {
		return false;
	}

	if (/[.!?]/.test(trimmed)) {
		return false;
	}

	if (trimmed.includes(" • ")) {
		return true;
	}

	return /\b(?:following|verified|followers?|connections?|promoted|job update|feed post number|commented on this|likes this|liked this|loves this|reposted this|\d+(?:st|nd|rd|th))\b/i.test(
		trimmed,
	);
}

function truncateKnownTail(value: string): string {
	const match = /(?:\.\.\.more|\u2026more)\b/i.exec(value);
	if (!match || match.index === undefined) {
		return value;
	}

	return value.slice(0, match.index).trim();
}

function stripLeadingMetadataByTimeAnchor(value: string): string {
	const match = TIME_ANCHOR_REGEX.exec(value);
	if (!match || match.index === undefined) {
		return value;
	}

	const prefix = value.slice(0, match.index).trim();
	if (!looksLikeMetadataPrefix(prefix)) {
		return value;
	}

	let remainder = value.slice(match.index + match[0].length).trim();
	remainder = remainder
		.replace(/^(?:•\s*)?edited(?:\s*•\s*)?/i, "")
		.replace(/^(?:•\s*)+/i, "")
		.trim();

	return remainder;
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

function hasConnectionsActorShape(tokens: string[], index: number): boolean {
	return (
		index >= 4 &&
		canonicalToken(tokens[index - 1] ?? "") === "connections" &&
		canonicalToken(tokens[index - 2] ?? "") === "other" &&
		isCountToken(canonicalToken(tokens[index - 3] ?? "")) &&
		canonicalToken(tokens[index - 4] ?? "") === "and"
	);
}

function isLikelyFollowBodyStart(tokens: string[], index: number): boolean {
	const token = canonicalToken(tokens[index] ?? "");
	if (!token) {
		return false;
	}

	if (token.startsWith("http")) {
		return true;
	}

	if (BODY_START_SINGLE_CUES.has(token)) {
		return true;
	}

	if (!BODY_START_PRONOUNS.has(token)) {
		return false;
	}

	const next = canonicalToken(tokens[index + 1] ?? "");
	return BODY_START_AFTER_PRONOUN.has(next);
}

function findFollowBodyStart(
	tokens: string[],
	targetStart: number,
): number | null {
	const minCandidate = targetStart + MIN_FOLLOW_TARGET_TOKENS;
	const maxCandidate = Math.min(
		tokens.length,
		targetStart + MAX_FOLLOW_TARGET_TOKENS,
	);

	for (let index = minCandidate; index < maxCandidate; index += 1) {
		if (isLikelyFollowBodyStart(tokens, index)) {
			return index;
		}
	}

	return null;
}

function parseFollowActivityPrefix(value: string): FollowPrefixParse | null {
	const tokens = splitTokens(value);
	if (tokens.length < 6) {
		return null;
	}

	const scanLimit = Math.min(tokens.length, MAX_PREFIX_SCAN_TOKENS);
	for (let index = 0; index < scanLimit; index += 1) {
		const token = canonicalToken(tokens[index] ?? "");
		if (token !== "follow" && token !== "follows") {
			continue;
		}

		const actorTokenCount = hasConnectionsActorShape(tokens, index)
			? index - 4
			: index;
		if (!hasValidActorPrefix(tokens, actorTokenCount)) {
			continue;
		}

		const targetStart = index + 1;
		if (targetStart >= tokens.length) {
			return { bodyStartTokenIndex: null };
		}

		const bodyStartTokenIndex = findFollowBodyStart(tokens, targetStart);
		return { bodyStartTokenIndex };
	}

	return null;
}

function stripLeadingFollowActivityPrefix(value: string): string {
	const parsed = parseFollowActivityPrefix(value);
	if (!parsed) {
		return value;
	}

	const tokens = splitTokens(value);
	if (parsed.bodyStartTokenIndex === null) {
		return "";
	}

	const bodyTokenCount = tokens.length - parsed.bodyStartTokenIndex;
	if (bodyTokenCount < MIN_BODY_TOKENS_AFTER_FOLLOW_ACTIVITY) {
		return value;
	}

	return tokens.slice(parsed.bodyStartTokenIndex).join(" ");
}

function stripLeadingActorMetadataCluster(value: string): string {
	const segments = splitSegments(value);
	if (segments.length < 2) {
		return value;
	}

	if (!isLikelyActorSegment(segments[0] ?? "")) {
		return value;
	}

	let index = 1;
	while (
		index < segments.length &&
		isIdentityMetadataSegment(segments[index])
	) {
		index += 1;
	}

	if (index === 1) {
		return value;
	}

	if (index >= segments.length) {
		return "";
	}

	return joinSegments(segments.slice(index));
}

function peelMetadataBoundarySegments(value: string): string {
	const segments = splitSegments(value);
	if (segments.length <= 1) {
		return value;
	}

	let start = 0;
	let end = segments.length - 1;

	while (start <= end && isIdentityMetadataSegment(segments[start] ?? "")) {
		start += 1;
	}

	while (end >= start && isIdentityMetadataSegment(segments[end] ?? "")) {
		end -= 1;
	}

	if (start === 0 && end === segments.length - 1) {
		return value;
	}

	if (start > end) {
		return "";
	}

	return joinSegments(segments.slice(start, end + 1));
}

function stripLeadingEdgeNoise(value: string): string {
	let current = value.trim();
	current = stripLeadingMetadataByTimeAnchor(current);
	current = stripLeadingFollowActionPrefix(current);
	current = stripLeadingFollowActivityPrefix(current);
	current = stripLeadingActorMetadataCluster(current);
	current = peelMetadataBoundarySegments(current);
	current = applyRulePass(current, LEADING_REGEX_RULES);
	current = peelMetadataBoundarySegments(current);
	return current;
}

function stripTrailingEdgeNoise(value: string): string {
	const stripped = applyRulePass(value, TRAILING_REGEX_RULES);
	return peelMetadataBoundarySegments(stripped);
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

function hasMetadataOnlyActorHeader(value: string): boolean {
	const segments = splitSegments(value);
	if (segments.length < 2) {
		return false;
	}

	if (!isLikelyActorSegment(segments[0] ?? "")) {
		return false;
	}

	return segments
		.slice(1)
		.every((segment) => isIdentityMetadataSegment(segment));
}

function hasMetadataOnlyEngagementHeader(value: string): boolean {
	return /^(?:feed post number\s+\d+\s+)?[a-z0-9][a-z0-9 .,'&/@|+-]{1,180}\s+(?:loves this|likes this|liked this|commented on this|reposted this)\s*$/i.test(
		value.trim(),
	);
}

function hasMetadataOnlyFollowActivity(value: string): boolean {
	const parsed = parseFollowActivityPrefix(value);
	if (!parsed) {
		return false;
	}

	if (parsed.bodyStartTokenIndex === null) {
		return true;
	}

	const bodyTokenCount = splitTokens(value).length - parsed.bodyStartTokenIndex;
	return bodyTokenCount < MIN_BODY_TOKENS_AFTER_FOLLOW_ACTIVITY;
}

function looksMetadataOnly(value: string): boolean {
	const trimmed = value.trim();
	if (!trimmed) {
		return true;
	}

	if (hasMetadataOnlyFollowActivity(trimmed)) {
		return true;
	}

	if (hasMetadataOnlyActorHeader(trimmed)) {
		return true;
	}

	if (hasMetadataOnlyEngagementHeader(trimmed)) {
		return true;
	}

	if (/^visible to anyone on or off linkedin$/i.test(trimmed)) {
		return true;
	}

	if (isIdentityMetadataSegment(trimmed)) {
		return true;
	}

	return false;
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

export function cleanupLinkedInText(rawText: string): LinkedInCleanupOutcome {
	if (!rawText) {
		return { text: "", classification: "metadata_only" };
	}

	const normalized = normalizeContentText(rawText);
	if (!normalized) {
		return { text: "", classification: "metadata_only" };
	}

	const harmonized = applyRulePass(normalized, NORMALIZE_RULES);
	const truncated = truncateKnownTail(harmonized);
	const peeled = peelEdges(truncated);

	if (!peeled) {
		if (looksMetadataOnly(truncated)) {
			return { text: "", classification: "metadata_only" };
		}
		return { text: harmonized, classification: "uncertain" };
	}

	if (looksMetadataOnly(peeled)) {
		return { text: "", classification: "metadata_only" };
	}

	if (shouldFallbackToNormalized(peeled, harmonized)) {
		return { text: harmonized, classification: "uncertain" };
	}

	return { text: peeled, classification: "content" };
}
