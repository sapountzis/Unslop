import { normalizeContentText } from "../../lib/hash";

const LEADING_NOISE_PATTERNS = [
	/^feed post number \d+\s*/i,
	/^[a-z0-9][a-z0-9 .,'&/+-]{0,140}\s(?:loves this|likes this|liked this|commented on this|reposted this)\s*/i,
];

const TRAILING_NOISE_PATTERNS = [
	/\b\d+\s+reactions?\b\s*$/i,
	/\b\d+\s+comments?\b\s*$/i,
	/\b(?:like|comment|repost|send)(?:\s+(?:like|comment|repost|send)){1,}\s*$/i,
];

function stripByPatterns(value: string, patterns: RegExp[]): string {
	let current = value.trim();
	let mutated = true;

	while (mutated && current.length > 0) {
		mutated = false;
		for (const pattern of patterns) {
			const next = current.replace(pattern, "").trim();
			if (next !== current) {
				current = next;
				mutated = true;
			}
		}
	}

	return current;
}

export function cleanupLinkedInText(rawText: string): string {
	if (!rawText) {
		return "";
	}

	const normalized = normalizeContentText(rawText);
	if (!normalized) {
		return "";
	}

	const withoutLeadingNoise = stripByPatterns(normalized, LEADING_NOISE_PATTERNS);
	return stripByPatterns(withoutLeadingNoise, TRAILING_NOISE_PATTERNS);
}
