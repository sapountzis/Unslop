// extension/src/lib/config.ts
// Extension configuration constants

// ── Provider defaults ────────────────────────────────────
// Users supply their own API key and can override base URL and model.
export const DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";
export const DEFAULT_MODEL = "gpt-4.1-mini";

// ── LLM call settings ────────────────────────────────────
export const LLM_MAX_TOKENS = 20;
export const LLM_TEMPERATURE = 0;

// ── Cache settings ───────────────────────────────────────
export const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
export const CACHE_MAX_ITEMS = 10_000;

// ── Batch classify settings ──────────────────────────────
export const BATCH_WINDOW_MS = 150;
export const BATCH_MAX_ITEMS = 20;
export const BATCH_MAX_INFLIGHT_REQUESTS = 3;
export const BATCH_RESULT_TIMEOUT_MS = 3000;

// ── API fetch timeout ────────────────────────────────────
export const FETCH_TIMEOUT_MS = 10000; // 10 second timeout for API requests

// ── Runtime diagnostics ──────────────────────────────────
export const DEBUG_CONTENT_RUNTIME = false;

// ── Hide rendering mode ──────────────────────────────────
// - 'collapse': fully remove hidden posts from layout (default)
// - 'label': keep post visible and show a compact decision pill
export type HideRenderMode = "collapse" | "label";
export const HIDE_RENDER_MODE: HideRenderMode = "collapse";

// ── Runtime orchestration timings ────────────────────────
export const ROUTE_HEARTBEAT_MS = 300;
export const PERSIST_INTERVAL_MS = 30_000;
export const SYNC_STORAGE_AREA = "sync";

// ── Mutation buffer drain limit per animation frame ──────
export const PROCESS_PER_FRAME = 20;

// ── Render commit pipeline fallback frame interval ───────
export const FALLBACK_RAF_INTERVAL_MS = 16;

// ── Background attachment resolver ───────────────────────
export const ATTACHMENT_BUDGET_RATIO = 0.1;
export const ATTACHMENT_RESOLVE_CONCURRENCY = 8;

// ── LLM endpoint probe timeout ───────────────────────────
export const LLM_PROBE_TIMEOUT_MS = 5000;

// ── Observability event ring buffer size ─────────────────
export const MAX_OBSERVABILITY_EVENTS = 25;
