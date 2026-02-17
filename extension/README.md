# Unslop Extension (Chrome MV3)

This extension filters LinkedIn, X, and Reddit feed surfaces with one strict loop:

1. Detect feed post surfaces.
2. Classify each post as `keep | hide`.
3. Commit the decision with one controlled DOM write pipeline.
4. Fail open to `keep` on runtime/network errors.

The implementation prioritizes two outcomes:
- Stable UX on highly dynamic social DOMs.
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

## Where The Flow Starts

If you want to trace LinkedIn classification from first touch to backend call, read in this order:

1. `extension/manifest.json`
   - Content script injection entrypoint for LinkedIn (`src/platforms/linkedin/index.ts`).
2. `src/platforms/linkedin/index.ts`
   - Calls `createPlatformRuntime(linkedinPlugin)`.
3. `src/platforms/linkedin/plugin.ts`
   - Wires LinkedIn selectors, parser, surface resolver, and route detector into the shared runtime contract.
4. `src/content/runtime.ts`
   - Core engine: observers, candidate processing, batch enqueue, result handling, render commit.
5. `src/background/index.ts`
   - Message hub that enforces auth/enabled gates and dispatches classify work.
6. `src/background/classify-pipeline.ts`
   - Resolves attachments and dispatches classify micro-batches.
7. `src/background/api.ts`
   - Performs HTTP call to `/v1/classify/batch` and streams NDJSON results back.

If you only need one file to start debugging runtime behavior, start at `src/content/runtime.ts`.

## System Overview

```mermaid
flowchart LR
  LI[LinkedIn DOM] --> ENTRY[Platform Entry<br/>src/platforms/linkedin/index.ts]
  ENTRY --> PLUGIN[LinkedIn Plugin<br/>src/platforms/linkedin/plugin.ts]
  PLUGIN --> CS[Shared Runtime<br/>src/content/runtime.ts]
  CS --> ATTACH[Attachment Controller]
  CS --> PARSER[LinkedIn Parser<br/>nodes + attachment refs]
  CS --> SURFACE[Post Surface Resolver]
  CS --> BUFFER[Mutation Buffer]
  CS --> BATCH[Batch Queue]
  BATCH --> BG[Background Worker]
  BG --> PIPE[Classify Pipeline]
  PIPE --> RESOLVE[Attachment Resolver]
  PIPE --> API[/v1/classify/batch]
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

1. Platform entry points (`src/platforms/linkedin/index.ts`, `src/platforms/x/index.ts`, `src/platforms/reddit/index.ts`) are injected on supported hosts at `document_start`.
2. If the current route is eligible for filtering, runtime immediately sets:
   - `html[data-unslop-preclassify="true"]`
3. LinkedIn preclassify CSS cloaks unprocessed feed containers before classification while preserving layout:
   - `html[data-unslop-preclassify="true"] [data-finite-scroll-hotkey-item]:has(.feed-shared-update-v2[role="article"]):not([data-unslop-processed]):not([data-id^="urn:li:aggregate:"]):not(:has(.feed-shared-aggregated-content)):not(:has(.update-components-feed-discovery-entity)) { opacity: 0 !important; pointer-events: none !important; }`
   - Aggregate/discovery modules (for example "Recommended for you") are excluded and left untouched.
4. Runtime controller reconciles route + enabled state and starts attachment.
5. Attachment controller either:
   - attaches a feed `MutationObserver`, or
   - attaches a body observer until the feed root appears.
6. Added nodes are converted to post surfaces:
   - `contentRoot` (for parsing/classification)
   - `renderRoot` (for hide/collapse decisions)
   - `labelRoot` (for pill placement in label mode)
   - `identity` (stable post instance key)
7. Mutation buffer batches candidate processing.
8. Each candidate is parsed into a multimodal payload (`nodes[]` + attachment refs) and sent through `batch-queue` to background.
9. Background classify pipeline resolves attachments concurrently (bounded) and dispatches classify micro-batches as posts become ready.
10. Pending decision coordinator starts the 3s fail-open timer only when a pending post is in viewport; offscreen posts wait for real classify results.
11. Background streams NDJSON classify results from backend back to content runtime.
12. Render commit pipeline coalesces decisions by `renderRoot`, sorts in DOM order, and flushes on RAF.
13. Decision renderer applies visual state on `labelRoot` and marks `renderRoot` as processed.
14. Route/toggle off triggers one centralized runtime dispose path.

## Core Concepts

- `Preclassify Gate`
  - Early route-level gate that hides unprocessed posts and prevents flash-then-hide.
- `contentRoot`
  - Semantic post node used by platform parser (`src/platforms/*/parser.ts`).
- `renderRoot`
  - Outer post container where hide/collapse classes and markers are applied.
- `labelRoot`
  - Element where the decision pill is placed in label mode (may differ from renderRoot on platforms with nested wrappers).
- `Identity`
  - Post instance key from platform-native attributes (for example LinkedIn URN, X status URL, Reddit `t3_*` or ad fallback key).
- `Terminal State`
  - Decision already committed for a specific `renderRoot + identity` (tracked per renderRoot, rendered on labelRoot).
- `Fail Open`
  - Timeout/error/invalid classify result resolves to `keep`.
- `Multimodal Payload`
  - Classification input is `{ post_id, author_*, nodes[], attachments[] }`, not text-only.
- `Attachment Resolution`
  - Content script extracts refs only; background fetches and normalizes attachment payloads.

## Platform Plugins

- `src/platforms/linkedin/*`
  - LinkedIn selectors/parser/surface/route wiring.
- `src/platforms/x/*`
  - X/Twitter selectors/parser/surface/route wiring with quote-scope parsing and hydration-aware media handling.
- `src/platforms/reddit/*`
  - Reddit selectors/parser/surface/route wiring for `shreddit-post` and `shreddit-ad-post`.
  - Reddit parser captures normalized title/body text plus subreddit/post metadata when available.
  - Reddit parser emits deterministic image attachment refs with deduped source URLs.

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
- Nested repost container selector:
  - `.update-components-mini-update-v2__link-to-details-page`
- Image attachment selector:
  - `.update-components-image__image`
- PDF/document selectors:
  - `.update-components-document__container`
  - `.document-s-container__document-element`
  - `[data-test-id^="feedshare-document"], [href*="media.licdn.com"], [src*="media.licdn.com"]`

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

`src/platforms/<platform>/index.ts`
- Platform content-script entrypoints (`linkedin`, `x`, `reddit`).
- Start runtime with `createPlatformRuntime(plugin)`.

`src/platforms/<platform>/plugin.ts`
- Platform adapter boundary for runtime:
  - route detection
  - selectors
  - parser
  - surface resolution

`src/content/runtime.ts`
- Platform-agnostic content runtime orchestrator.
- Owns lifecycle, observers, mutation buffer draining, classify dispatch, and decision commit handoff.

`src/content/attachment-controller.ts`
- Observer ownership and generation guards.
- Public surface: `ensureAttached`, `detachAll`, `isLive`.

`src/content/mutation-buffer.ts`
- Deduplicated queue of candidate elements.
- Drained per frame (`PROCESS_PER_FRAME`).

`src/content/batch-queue.ts`
- Batches classify requests and routes classify results back by `post_id`.
- Transport-only responsibility (no UI timeout policy).

`src/content/pending-decision-coordinator.ts`
- Owns pending decision state (`post_id`, identity, render root, timer/status).
- Starts `BATCH_RESULT_TIMEOUT_MS` only when pending posts are visible.
- Keeps late results routable and applies late `hide` only when identity is still current.

`src/content/render-commit-pipeline.ts`
- Single commit boundary for all decisions.
- Coalesces by render root.
- Flushes by RAF.

`src/content/decision-renderer.ts`
- Applies `keep | hide`.
- Hide render mode:
  - `collapse` (default): `display: none`.
  - `label`: keeps post visible and prepends a compact Unslop decision pill.

`src/background/index.ts`
- Message hub and auth/enabled enforcement.
- Handles classify dispatch, billing, usage, stats, JWT state, and diagnostics.

`src/background/classify-pipeline.ts`
- Staged background orchestrator for classify requests.
- Resolves attachments with bounded concurrency (`p-limit`) and short deadline budget.
- Flushes ready posts to classify batches using shared batch constants (`BATCH_MAX_ITEMS`, `BATCH_WINDOW_MS`).
- Caps concurrent in-flight classify HTTP requests (`BATCH_MAX_INFLIGHT_REQUESTS`, default `2`) to avoid connection-pool saturation.

`src/background/attachment-resolver.ts`
- Resolves image refs to `{ sha256, mime_type, base64 }` with byte budget enforcement.
- Resolves PDF refs to `{ source_url, excerpt_text }` best-effort.
- Fail-open behavior: broken attachments are dropped within a post; post classification still proceeds.

`src/popup/App.ts`
- Sign-in flow, enable toggle, hide mode selector, plan/usage UI.
- One-click diagnostics panel with pass/warn/fail checks and remediation hints.
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
  - `TOGGLE_ENABLED`, `RELOAD_ACTIVE_TAB`
- Billing/analytics:
  - `CREATE_CHECKOUT`, `GET_STATS`
- Diagnostics:
  - `GET_RUNTIME_DIAGNOSTICS`, `GET_CONTENT_DIAGNOSTICS`

`CLASSIFY_BATCH` request payload:
- `posts[]` where each post is:
  - `post_id`, `author_id`, `author_name`
  - `nodes[]`: `{ id, parent_id, kind, text }`
  - `attachments[]`: image refs/resolved image payloads and pdf refs/resolved pdf payloads

`CLASSIFY_BATCH_RESULT` item payload:
- success path: `{ post_id, decision, source }`
- quota path: `{ post_id, error: "quota_exceeded" }`
- fail-open path on transport/runtime issues: `{ post_id }` (treated as keep/error in content runtime)

## Configuration

Defined in `src/lib/config.ts`:

- `API_BASE_URL`
- `BATCH_WINDOW_MS`
- `BATCH_MAX_ITEMS`
- `BATCH_MAX_INFLIGHT_REQUESTS`
- `BATCH_RESULT_TIMEOUT_MS`
- `CACHE_TTL_MS`
- `CACHE_MAX_ITEMS`
- `DEBUG_CONTENT_RUNTIME`
- `HIDE_RENDER_MODE`

Hide mode persistence key:
- `hideRenderMode` (`src/lib/hide-render-mode.ts`)

Enabled-state default:
- missing storage value resolves to enabled (`src/lib/enabled-state.ts`)

## Host Permissions

`extension/manifest.json` host permissions include:

- `https://www.linkedin.com/*` for feed DOM parsing/rendering.
- `https://media.licdn.com/*` for background attachment fetches (images/documents).
- `https://www.reddit.com/*` and `https://old.reddit.com/*` for Reddit feed DOM parsing/rendering.
- `https://i.redd.it/*`, `https://preview.redd.it/*`, and `https://external-preview.redd.it/*` for Reddit image attachment fetches in background resolution.
- `https://api.getunslop.com/*` and `http://localhost:3000/*` for backend API and local development.

Rationale:
- attachment resolution happens in background, not content script; media host permissions (for example `media.licdn.com`, `i.redd.it`, `preview.redd.it`) are required for that fetch path.
- if attachment fetch fails (permissions/network/content-type), classification continues with reduced payload (fail-open).

## Troubleshooting Playbook

### Symptom: no backend classify calls

1. Open popup and click `Run Diagnostics`.
2. Resolve red checks first (`fail`), then yellow checks (`warn`), then rerun.
3. Critical checks for classify path:
   - `storage_enabled`
   - `storage_jwt_present`
   - `active_tab_linkedin`
   - `eligible_feed_route`
   - `content_ping`
   - `candidate_posts_found`
   - `post_identity_ready`
4. If diagnostics are unavailable, fall back to manual checks:
   - current URL is `/feed/` or starts with `/feed/`
   - popup toggle is enabled
   - feed root matches `SELECTORS.feed`
   - runtime markers appear on posts (`data-unslop-checking` / `data-unslop-processed`)
   - no stale disabled state in `chrome.storage.sync`

### Symptom: onboarding on a new machine fails

1. Open `https://www.linkedin.com/feed/` in the same browser profile where the extension is installed.
2. Run popup `Run Diagnostics`.
3. Follow the first failing line's `next action`.
4. Re-run diagnostics until summary shows no failures.
5. If failures remain with:
   - `content_script_loaded`: check extension site access for LinkedIn and reload tab.
   - `candidate_posts_found`: scroll feed, wait for hydration, rerun.
   - `post_identity_ready`: LinkedIn DOM variant likely changed; compare selectors vs live DOM.

### Symptom: attachment context is missing in backend decisions

1. Confirm `https://media.licdn.com/*` exists in `host_permissions`.
2. For Reddit, confirm `https://i.redd.it/*`, `https://preview.redd.it/*`, and `https://external-preview.redd.it/*` exist in `host_permissions`.
3. Confirm platform parser output includes `attachments[]` refs.
4. Confirm background resolver does not exceed budgets:
   - image: `MAX_IMAGE_BYTES`
   - PDF fetch: `MAX_PDF_FETCH_BYTES`
   - PDF excerpt: `MAX_PDF_EXCERPT_CHARS`
5. On fetch/parse errors, expect fail-open behavior: attachment dropped, post still classified.

### Symptom: posts hidden but large blank space

1. Confirm preclassify selector is active on `<html data-unslop-preclassify="true">`.
2. Confirm markers are on `renderRoot` containers, not inner post nodes.
3. Confirm render pipeline is draining (pending size should not grow unbounded).

### Symptom: white screen/rerender loop while scrolling

1. Confirm watchdog does not force reconcile while classify work is pending.
2. Confirm preclassify selector excludes aggregate/discovery modules:
   - `:not([data-id^="urn:li:aggregate:"])`
   - `:not(:has(.feed-shared-aggregated-content))`
   - `:not(:has(.update-components-feed-discovery-entity))`
3. Confirm runtime is not repeatedly cycling through `dispose()` + reinitialize on the same feed route.

### Symptom: mode switch (`collapse` <-> `label`) looks disruptive

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

## Manual Verification Checklist

- [ ] Classification payload is multimodal: request includes `nodes[]` and `attachments[]` (no `content_text` contract).
- [ ] Background resolves attachments before classify and enforces byte/excerpt budgets.
- [ ] Parser/attachment failures fail open: posts remain processable and extension does not crash.
- [ ] `manifest.json` host permissions include `https://media.licdn.com/*` with attachment-fetch rationale reflected in docs.

## Maintenance Rule (Required)

`extension/README.md` is a living technical guide.

Any change to extension behavior, architecture, lifecycle, selectors, config, message contracts, or troubleshooting expectations must update this README in the same change.
