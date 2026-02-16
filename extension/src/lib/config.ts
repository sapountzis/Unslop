// extension/src/lib/config.ts
// Extension configuration constants

// API Configuration
// Toggle between production and local development by uncommenting the appropriate line
// For local development, use: http://localhost:3000
// For production, use: https://api.getunslop.com

// export const API_BASE_URL = "http://localhost:3000";
export const API_BASE_URL = "https://api.getunslop.com";

// Cache settings
export const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
export const CACHE_MAX_ITEMS = 10_000;

// Batch classify settings
export const BATCH_WINDOW_MS = 75;
// Keep in sync with backend/src/lib/policy-constants.ts: CLASSIFY_BATCH_MAX_SIZE
export const BATCH_MAX_ITEMS = 20;
export const BATCH_MAX_INFLIGHT_REQUESTS = 2;
export const BATCH_RESULT_TIMEOUT_MS = 3000; // Viewport-aware fail-open timeout in pending-decision coordinator

// API fetch timeout
export const FETCH_TIMEOUT_MS = 10000; // 10 second timeout for API requests

// Runtime diagnostics
export const DEBUG_CONTENT_RUNTIME = false;

// Hide rendering mode:
// - 'collapse': fully remove hidden posts from layout (default production behavior)
// - 'label': keep post visible and show a compact decision pill
export type HideRenderMode = "collapse" | "label";
export const HIDE_RENDER_MODE: HideRenderMode = "collapse";
