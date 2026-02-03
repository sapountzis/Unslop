// extension/src/lib/hash.ts

/**
 * Normalize content text (matches backend)
 */
export function normalizeContentText(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 4000);
}

/**
 * Generate SHA-256 hash (hex string)
 * Uses Web Crypto API for browser compatibility
 */
export async function sha256(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Derive post_id from author_id and content_text
 */
export async function derivePostId(authorId: string, contentText: string): Promise<string> {
  const combined = `${authorId}\n${contentText}`;
  return await sha256(combined);
}
