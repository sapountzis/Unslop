// Content hashing utilities
import { createHash } from "crypto";
import { CONTENT_TEXT_MAX_CHARS } from "./policy-constants";

/**
 * Normalize content text for hashing and storage
 * Matches the extension's normalization
 */
export function normalizeContentText(text: string): string {
	return text
		.toLowerCase()
		.replace(/\s+/g, " ")
		.trim()
		.slice(0, CONTENT_TEXT_MAX_CHARS);
}

/**
 * Generate SHA-256 hash of content text (hex string)
 */
export function hashContentText(contentText: string): string {
	return createHash("sha256").update(contentText, "utf-8").digest("hex");
}

/**
 * Derive post_id from author_id and content_text
 * Used when LinkedIn doesn't provide a stable post ID
 */
export function derivePostId(authorId: string, contentText: string): string {
	const combined = `${authorId}\n${contentText}`;
	return createHash("sha256").update(combined, "utf-8").digest("hex");
}
