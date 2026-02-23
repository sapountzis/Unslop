// extension/src/lib/config.ts
// Extension configuration constants

// API Configuration
// Toggle between production and local development by uncommenting the appropriate line
// For local development, use: http://localhost:3000
// For production, use: https://api.getunslop.com

// export const API_BASE_URL = "http://localhost:30 00";
export const API_BASE_URL = "https://api.getunslop.com";

// Cache settings
export const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
export const CACHE_MAX_ITEMS = 10_000;

// Batch classify settings
export const BATCH_WINDOW_MS = 20;
// Keep in sync with backend/src/lib/policy-constants.ts: CLASSIFY_BATCH_MAX_SIZE
export const BATCH_MAX_ITEMS = 20;
export const BATCH_MAX_INFLIGHT_REQUESTS = 3;
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

// Runtime orchestration timings
export const ROUTE_HEARTBEAT_MS = 300;
export const PERSIST_INTERVAL_MS = 30_000;
export const SYNC_STORAGE_AREA = "sync";

// Mutation buffer drain limit per animation frame
export const PROCESS_PER_FRAME = 20;

// Render commit pipeline fallback frame interval (used when rAF is unavailable)
export const FALLBACK_RAF_INTERVAL_MS = 16;

// Background attachment resolver
// Cap attachment pre-resolution wait so text-first classification starts sooner.
export const ATTACHMENT_BUDGET_RATIO = 0.1;
export const ATTACHMENT_RESOLVE_CONCURRENCY = 8;

// Backend reachability probe timeout
export const BACKEND_PROBE_TIMEOUT_MS = 5000;

// Observability event ring buffer size
export const MAX_OBSERVABILITY_EVENTS = 25;
