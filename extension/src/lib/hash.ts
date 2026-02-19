// extension/src/lib/hash.ts

/**
 * Normalize content text (matches backend)
 */
export function normalizeContentText(text: string): string {
	return text.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 4000);
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
