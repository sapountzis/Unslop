// extension/src/lib/selectors.ts
// Shared data attributes used by the extension (platform-agnostic).
// Platform-specific DOM selectors live in src/platforms/<platform>/selectors.ts.

// Data attributes used by the extension
export const ATTRIBUTES = {
    processed: 'data-unslop-processed',
    processing: 'data-unslop-checking',
    decision: 'data-unslop-decision',
    preclassify: 'data-unslop-preclassify',
    identity: 'data-unslop-identity',
} as const;

// Auth selectors (shared across platforms, used by auth.ts)
export const SELECTORS = {
    jwtMeta: 'meta[name="unslop-jwt"]',
} as const;
