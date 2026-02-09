# Unslop Extension (Chrome MV3)

This extension filters the LinkedIn home feed with one strict loop:

1. Detect feed post surfaces.
2. Classify each post as `keep | dim | hide`.
3. Commit the decision with one controlled DOM write pipeline.
4. Fail open to `keep` on runtime/network errors.

The implementation prioritizes two outcomes:
- Stable UX on a highly dynamic LinkedIn DOM.
- Small, explicit module boundaries for easier debugging.

## Quick Start (For New Developers)

From `extension/`:

```bash
bun install
bun run build
```

Load the built extension in Chrome/Brave:
1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Click "Load unpacked".
4. Select `extension/dist`.

Useful dev commands:

```bash
bun run dev
bun test
bunx tsc --noEmit --noUnusedLocals --noUnusedParameters -p tsconfig.json
bun run build
```

## System Overview

```mermaid
flowchart LR
  LI[LinkedIn DOM] --> CS[Content Runtime<br/>src/content/linkedin.ts]
  CS --> ATTACH[Attachment Controller]
  CS --> SURFACE[Post Surface Resolver]
  CS --> BUFFER[Mutation Buffer]
  CS --> BATCH[Batch Queue]
  BATCH --> BG[Background Worker]
  BG --> API[/v1/classify/batch]
  API --> BG
  BG --> BATCH
  CS --> VIS[Visibility Index]
  CS --> PIPE[Render Commit Pipeline]
  PIPE --> RENDER[Decision Renderer]
  RENDER --> LI
  CS --> LIFE[Runtime Lifecycle]
  CS --> CTRL[Runtime Controller]
  CS --> WD[Starvation Watchdog]
```

## End-to-End Flow (What Actually Happens)

1. `src/content/linkedin.ts` is injected on `https://www.linkedin.com/*` at `document_start`.
2. If URL route matches `/feed/`, it immediately sets:
   - `html[data-unslop-preclassify="true"]`
3. CSS preclassify rule cloaks unprocessed feed containers before classification while preserving layout:
   - `html[data-unslop-preclassify="true"] [data-finite-scroll-hotkey-item]:has(.feed-shared-update-v2[role="article"]):not([data-unslop-processed]):not([data-id^="urn:li:aggregate:"]):not(:has(.feed-shared-aggregated-content)):not(:has(.update-components-feed-discovery-entity)) { opacity: 0 !important; pointer-events: none !important; }`
   - Aggregate/discovery modules (for example "Recommended for you") are excluded and left untouched.
4. Runtime controller reconciles route + enabled state and starts attachment.
5. Attachment controller either:
   - attaches a feed `MutationObserver`, or
   - attaches a body observer until the feed root appears.
6. Added nodes are converted to post surfaces:
   - `contentRoot` (for parsing/classification)
   - `renderRoot` (for visual write operations)
   - `identity` (stable post instance key)
7. Mutation buffer batches candidate processing.
8. Each candidate is parsed and sent through `batch-queue` to background.
9. Background streams NDJSON classify results from backend back to content runtime.
10. Render commit pipeline coalesces decisions by `renderRoot`, sorts in DOM order, and flushes on RAF.
11. Decision renderer applies one terminal visual state on `renderRoot` and marks it processed.
12. Route/toggle off triggers one centralized runtime dispose path.

## Core Concepts

- `Preclassify Gate`
  - Early route-level gate that hides unprocessed posts and prevents flash-then-hide.
- `contentRoot`
  - Semantic post node used by parser (`src/content/linkedin-parser.ts`).
- `renderRoot`
  - Outer post container where hide/dim/stub classes and markers are applied.
- `Identity`
  - Post instance key from `data-id` / `data-urn` / nested URN fallback.
- `Terminal State`
  - Decision already committed for a specific `renderRoot + identity`.
- `Fail Open`
  - Timeout/error/invalid classify result resolves to `keep`.

## Selector And Marker Contract

Defined in `src/lib/selectors.ts`:

- Feed root selector:
  - `.scaffold-finite-scroll__content, main .scaffold-finite-scroll, main`
- Candidate content selector:
  - `.feed-shared-update-v2[role="article"]`
- Render root selector:
  - `[data-finite-scroll-hotkey-item]:has(.feed-shared-update-v2[role="article"])`
- Recommendation/discovery selector:
  - `.update-components-feed-discovery-entity, .feed-shared-aggregated-content`

DOM attributes used by runtime:
- `data-unslop-preclassify`
- `data-unslop-checking`
- `data-unslop-processed`
- `data-unslop-decision`
- `data-unslop-identity`

These are the core DOM contracts. If selectors or marker behavior changes, update this README.

## Runtime State Model

`src/content/runtime-controller.ts` uses:
- `disabled`
- `enabled_attaching`
- `enabled_active`

Reconcile reasons:
- `init`
- `route`
- `toggle`
- `visibility`
- `watchdog`

Rules:
1. Disabled or non-feed route => full dispose.
2. Enabled + feed route => initialize/ensure attached.
3. Watchdog reconcile may force reattach.

## Module Boundaries

`src/content/linkedin.ts`
- Main orchestrator.
- Owns runtime composition and high-level flow.

`src/content/attachment-controller.ts`
- Observer ownership and generation guards.
- Public surface: `ensureAttached`, `detachAll`, `isLive`.

`src/content/post-surface.ts`
- Converts arbitrary nodes into canonical `{ contentRoot, renderRoot, identity }`.

`src/content/mutation-buffer.ts`
- Deduplicated queue of candidate elements.
- Drained per frame (`PROCESS_PER_FRAME`).

`src/content/batch-queue.ts`
- Batches classify requests and tracks pending entries.
- Single timeout authority: `BATCH_RESULT_TIMEOUT_MS` (3s).

`src/content/visibility-index.ts`
- Tracks element visibility snapshots via `IntersectionObserver`.
- Supports hide deferral policy.

`src/content/render-commit-pipeline.ts`
- Single commit boundary for all decisions.
- Coalesces by render root.
- Flushes by RAF.
- Defers destructive `hide + collapse` while currently visible.
- Also defers far-offscreen collapse until the post enters a viewport-adjacent commit band.

`src/content/decision-renderer.ts`
- Applies `keep | dim | hide`.
- Hide render mode:
  - `collapse` (default): `display: none`.
  - `stub`: shows lightweight Unslop stub + unhide button.

`src/content/runtime-lifecycle.ts`
- Central cleanup registry.
- One `dispose()` path for teardown.

`src/content/starvation-watchdog.ts`
- Detects stalled processing and triggers reconcile.
- Pending batch classify work is treated as active progress to avoid false watchdog recover loops during normal API latency.

`src/background/index.ts`
- Message hub and auth/enabled enforcement.
- Handles classify batching, billing, usage, stats, JWT state.

`src/popup/App.ts`
- Sign-in flow, enable toggle, hide mode selector, plan/usage UI.
- Hide-mode change triggers controlled LinkedIn feed tab reload via background.

`src/stats/index.ts`
- Stats dashboard rendered with Chart.js.

## Message Contracts

Defined in `src/lib/messages.ts`:

- Classification:
  - `CLASSIFY_BATCH`
  - `CLASSIFY_BATCH_RESULT`
- Auth/account:
  - `GET_USER_INFO`, `START_AUTH`, `SET_JWT`, `CLEAR_JWT`
- Product:
  - `TOGGLE_ENABLED`, `RELOAD_ACTIVE_LINKEDIN_TAB`
- Billing/analytics:
  - `CREATE_CHECKOUT`, `GET_USAGE`, `GET_STATS`

## Configuration

Defined in `src/lib/config.ts`:

- `API_BASE_URL`
- `BATCH_WINDOW_MS`
- `BATCH_MAX_ITEMS`
- `BATCH_RESULT_TIMEOUT_MS`
- `CACHE_TTL_MS`
- `CACHE_MAX_ITEMS`
- `DEBUG_CONTENT_RUNTIME`
- `HIDE_RENDER_MODE`

Hide mode persistence key:
- `hideRenderMode` (`src/lib/hide-render-mode.ts`)

Enabled-state default:
- missing storage value resolves to enabled (`src/lib/enabled-state.ts`)

## Troubleshooting Playbook

### Symptom: no backend classify calls

1. Confirm current URL is `/feed/` or starts with `/feed/`.
2. Confirm popup toggle is enabled.
3. Confirm page has feed root matching `SELECTORS.feed`.
4. Confirm runtime markers appear on posts (`data-unslop-checking` / `data-unslop-processed`).
5. Confirm no stale disabled state in `chrome.storage.sync`.

### Symptom: posts hidden but large blank space

1. Confirm preclassify selector is active on `<html data-unslop-preclassify="true">`.
2. Confirm markers are on `renderRoot` containers, not inner post nodes.
3. Confirm render pipeline is draining (pending size should not grow unbounded).

### Symptom: white screen/rerender loop while scrolling

1. Confirm watchdog does not force reconcile while `getPendingBatchCount()` is non-zero.
2. Confirm preclassify selector excludes aggregate/discovery modules:
   - `:not([data-id^="urn:li:aggregate:"])`
   - `:not(:has(.feed-shared-aggregated-content))`
   - `:not(:has(.update-components-feed-discovery-entity))`
3. Confirm runtime is not repeatedly cycling through `dispose()` + reinitialize on the same feed route.

### Symptom: mode switch (`collapse` <-> `stub`) looks disruptive

Expected behavior:
- Popup writes the new mode to storage.
- Popup asks background to reload active LinkedIn feed tab.
- Reload is intentional to avoid in-place mass remutation of the current feed DOM.

### Symptom: toggle off/on seems inconsistent

Expected behavior:
- Toggle change triggers storage event.
- Runtime controller reconciles.
- Off => full `dispose()`.
- On + eligible route => full initialize + attachment + scan.

## Testing Strategy

Tests live close to modules under `src/content`, `src/background`, and `src/lib`.
Current suite focuses on:
- route detection
- attachment and lifecycle regressions
- parser/surface selection
- render pipeline stability
- mutation buffering
- watchdog behavior

Run:

```bash
bun test
```

## Maintenance Rule (Required)

`extension/README.md` is a living technical guide.

Any change to extension behavior, architecture, lifecycle, selectors, config, message contracts, or troubleshooting expectations must update this README in the same change.
