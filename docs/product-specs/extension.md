---
owner: unslop
status: verified
last_verified: 2026-02-17
---

# Chrome Extension Spec (v0.3)

## problem
Users need a minimal Chrome extension that can classify LinkedIn, X, and Reddit feed posts and apply decisions without breaking normal browsing.

## non_goals
- UI complexity beyond toggle/sign-in/status/upgrade/diagnostics.
- Per-author heuristics, sliders, or non-spec runtime feature expansion.

## acceptance_criteria
- AC1: Extension runtime extracts canonical post payloads and requests batch classification.
- AC2: Decisions are applied as `keep|hide` with fail-open behavior.
- AC3: Auth callback, storage, popup controls, diagnostics checks, and backend message contracts are defined.

## constraints
- Performance: Mutation observation and classify batching must not degrade feed interaction.
- Security/Privacy: JWT handling uses extension storage and auth-domain callback transport only.
- Compatibility: Must run under Chrome MV3 and current LinkedIn/X/Reddit DOM integration points.

## telemetry
- Logs: Runtime classify request/response outcomes and auth/session edge cases.
- Metrics: Classification latency/timeout rates and fail-open frequency.
- Traces: Optional message flow spans across content/background/api boundaries.

## test_plan
- Unit: Parser, selector, detection-profile, and decision rendering modules.
- Integration: Background/content message contracts and auth persistence behavior.
- E2E: Popup auth + feed classification smoke across supported pages.

## rollout
- Flags: No runtime feature flags required.
- Migration: Manifest/build changes shipped with versioned extension bundles.
- Backout: Roll back to last known-good extension package if regressions appear.

## Summary

The extension filters supported social feeds by requesting a backend decision for each post and applying one of:

- `keep`
- `hide`

The extension must be minimal and must **fail open**.

## Components

1. **Content Scripts (Platform plugins)**
   - LinkedIn plugin runs on `https://www.linkedin.com/*`.
   - X plugin runs on `https://x.com/*` and `https://twitter.com/*`.
   - Reddit plugin runs on `https://www.reddit.com/*` and `https://old.reddit.com/*`.
   - Starts at `document_start` to enable pre-classification hiding.
   - Detects posts using `MutationObserver`.
   - Extracts `post_id`, `text`, and `attachments`.
   - Sends posts to background for batch classification.
   - Applies the returned decision to the DOM.

2. **Background Service Worker**
   - Stores JWT and enabled toggle in `chrome.storage.sync`.
   - Calls backend endpoints:
     - `/v1/classify/batch`
     - `/v1/me`
     - `/v1/auth/start`
     - `/v1/billing/create-checkout`
   - Handles 401 by clearing token.

3. **Content Script (Auth Domain)**
   - Runs on `https://api.getunslop.com/*`.
   - Reads JWT from the `/v1/auth/callback` page (meta tag).
   - Sends JWT to background via `chrome.runtime.sendMessage`.

4. **Popup UI**
   - Minimal controls:
     - Enabled toggle (on/off)
     - Sign in (email field + button)
     - Account status (email + plan)
     - Upgrade to Pro (opens checkout URL)
     - Run Diagnostics (one-click runtime + selector + storage health checks)

No options page is required.

## Storage keys (sync)

```ts
type Storage = {
  jwt?: string;                              // session token
  enabled: boolean;                          // default true
  hideRenderMode?: "collapse" | "label";     // default "collapse"
  devMode?: boolean;                         // default false; gates diagnostics UI
};
```

## Post extraction (required)

For each feed post element:

- `post_id`:
  - Use platform-native stable ID if present, else derive (see below)
- `text`:
  - whole post content (author, title, body, quoted content, metadata) as a single normalized string
- `attachments`:
  - zero or more items with optional `ordinal` for ordering
  - parser may emit attachment refs (image `src`; pdf `iframe_src` / `container_data_url` / `source_hint`)
  - background resolver converts refs into canonical payloads:
    - `image` attachments include `sha256`, `mime_type`, `base64`
    - `pdf` attachments include `source_url` and optional `excerpt_text`

### Derived post_id

If no native post id exists:

- `post_id = hex(SHA-256(normalizeContentText(text)))`

### Canonical payload requirements

- preserve deterministic attachment ordering when building request payloads
- the extension does not compute `content_fingerprint`
- backend computes global `content_fingerprint` for cache lookups from canonical payload content

### Reddit capture requirements

- Candidate post roots include both `shreddit-post` and `shreddit-ad-post`.
- Parser includes title/body plus available subreddit and post metadata in normalized text.
- Parser emits image attachment refs from Reddit media containers with deterministic ordinals and stable deduping by source URL.

## Classification flow (required)

Content script → background:

```ts
chrome.runtime.sendMessage({
  type: "CLASSIFY_BATCH",
  posts: [{ post_id, text, attachments }]
});
```

Background → backend:
- `POST /v1/classify/batch` with JWT bearer token

Background → content script stream messages:

```ts
{
  type: "CLASSIFY_BATCH_RESULT",
  item: {
    post_id: string,
    decision?: "keep" | "hide",
    source?: "llm" | "cache" | "error",
    error?: "quota_exceeded"
  }
}
```

The content script uses a fail-open timeout (`3000ms` baseline). If no decision arrives in time, it renders `keep`.

## Applying decisions (required)

- **keep**: no changes
- **hide**:
  - keep the platform post node mounted
  - in `collapse` mode: collapse it with CSS (`display: none`, no visible replacement text)
  - in `label` mode: keep post visible and prepend a compact decision pill
  - do not remove/unmount the node to reduce rerender churn

## Pre-classification behavior

- While a post is being classified, its render root is marked with `data-unslop-checking`.
- Once a decision is applied the marker is removed and `data-unslop-processed` is set.
- Already-processed elements are skipped on subsequent mutation callbacks.

## Failure modes (required)

- If classify fails, returns 429, or returns invalid payload:
  - treat as `decision="keep"`
- Never throw uncaught errors that break host-platform rendering.
