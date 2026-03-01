// extension/src/lib/selectors.ts
// Shared data attributes used by the extension (platform-agnostic).
// Platform-specific DOM selectors live in src/platforms/<platform>/selectors.ts.

// Data attributes used by the extension
export const ATTRIBUTES = {
	pending: "data-unslop-pending",
	processed: "data-unslop-processed",
	processing: "data-unslop-checking",
	decision: "data-unslop-decision",
	identity: "data-unslop-identity",
} as const;
