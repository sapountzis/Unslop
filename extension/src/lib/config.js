// extension/src/lib/config.ts
// Extension configuration constants
// API Configuration
// Toggle between production and local development by uncommenting the appropriate line
// For local development, use: http://localhost:3000
// For production, use: https://api.getunslop.com
export const API_BASE_URL = 'http://localhost:3000';
// export const API_BASE_URL = 'https://api.getunslop.com';
// Derived from API_BASE_URL
export const AUTH_CALLBACK_ORIGIN = API_BASE_URL;
// Cache settings
export const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
export const CACHE_MAX_ITEMS = 10000;
// Batch classify settings
export const BATCH_WINDOW_MS = 75;
export const BATCH_MAX_ITEMS = 20;
// Timing settings
export const FEED_POLL_INTERVAL_MS = 2000; // Backup polling for SPA navigation
