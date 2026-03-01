// extension/src/lib/hash.ts

import type { PostAttachment } from "../types";

/**
 * Normalize content text (matches backend)
 */
export function normalizeContentText(text: string): string {
	return text.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 4000);
}

function normalizeToken(value: string, maxLen = 1024): string {
	return value.toLowerCase().replace(/\s+/g, " ").trim().slice(0, maxLen);
}

function normalizeUrlToken(value: string | undefined): string {
	if (!value) return "";
	const trimmed = value.trim();
	if (trimmed.length === 0) return "";

	try {
		const parsed = new URL(trimmed);
		const normalizedPath = parsed.pathname.replace(/\/+$/, "");
		return normalizeToken(
			`${parsed.protocol}//${parsed.host}${normalizedPath}`,
			1024,
		);
	} catch {
		return normalizeToken(trimmed, 1024);
	}
}

function buildAttachmentDescriptor(
	attachment: PostAttachment,
	fallbackOrdinal: number,
): string {
	const ordinal =
		typeof attachment.ordinal === "number" ? attachment.ordinal : fallbackOrdinal;

	if (attachment.kind === "image") {
		if ("sha256" in attachment && typeof attachment.sha256 === "string") {
			return `image:${ordinal}:sha256:${normalizeToken(attachment.sha256, 256)}`;
		}
		const src = "src" in attachment ? normalizeUrlToken(attachment.src) : "";
		return `image:${ordinal}:src:${src}`;
	}

	if ("source_url" in attachment && typeof attachment.source_url === "string") {
		return `pdf:${ordinal}:source:${normalizeUrlToken(attachment.source_url)}`;
	}
	if ("iframe_src" in attachment && typeof attachment.iframe_src === "string") {
		return `pdf:${ordinal}:iframe:${normalizeUrlToken(attachment.iframe_src)}`;
	}
	if (
		"container_data_url" in attachment &&
		typeof attachment.container_data_url === "string"
	) {
		return `pdf:${ordinal}:container:${normalizeUrlToken(attachment.container_data_url)}`;
	}
	if ("source_hint" in attachment && typeof attachment.source_hint === "string") {
		return `pdf:${ordinal}:hint:${normalizeToken(attachment.source_hint, 256)}`;
	}

	return `pdf:${ordinal}:unknown`;
}

/**
 * Generate SHA-256 hash (hex string)
 * Uses Web Crypto API for browser compatibility
 */
export async function sha256(text: string): Promise<string> {
	const encoder = new TextEncoder();
	const data = encoder.encode(text);
	const hashBuffer = await crypto.subtle.digest("SHA-256", data);
	const hashArray = Array.from(new Uint8Array(hashBuffer));
	return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Derive post_id from content text when no platform identity exists
 */
export async function derivePostId(text: string): Promise<string> {
	return await sha256(normalizeContentText(text));
}

export async function buildClassificationCacheKey(input: {
	text: string;
	attachments: PostAttachment[];
}): Promise<string> {
	const normalizedText = normalizeContentText(input.text);
	const normalizedAttachments = input.attachments
		.map((attachment, index) => buildAttachmentDescriptor(attachment, index))
		.sort();

	const rawKeyInput = JSON.stringify({
		version: 1,
		text: normalizedText,
		attachments: normalizedAttachments,
	});
	return await sha256(rawKeyInput);
}
