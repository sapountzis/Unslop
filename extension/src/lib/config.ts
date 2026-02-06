// extension/src/lib/config.ts
// Extension configuration constants

// API Configuration
// Toggle between production and local development by uncommenting the appropriate line
// For local development, use: http://localhost:3000
// For production, use: https://api.getunslop.com

export const API_BASE_URL = 'http://localhost:3000';
// export const API_BASE_URL = 'https://api.getunslop.com';

// Cache settings
export const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
export const CACHE_MAX_ITEMS = 10_000;

// Batch classify settings
export const BATCH_WINDOW_MS = 75;
export const BATCH_MAX_ITEMS = 20;
export const BATCH_RESULT_TIMEOUT_MS = 2000; // Single fail-open timeout authority for classification

// Runtime diagnostics
export const DEBUG_CONTENT_RUNTIME = false;

// Hide rendering mode:
// - 'collapse': fully remove hidden posts from layout (default production behavior)
// - 'stub': show a minimal Unslop stub with an Unhide button (useful for local testing)
export type HideRenderMode = 'collapse' | 'stub';
export const HIDE_RENDER_MODE: HideRenderMode = 'collapse';
