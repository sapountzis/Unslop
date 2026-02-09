# Chrome Extension Spec (v0.1)

## Summary

The extension filters the LinkedIn feed by requesting a backend decision for each post and applying one of:

- `keep`
- `dim`
- `hide`

The extension must be minimal and must **fail open**.

## Components

1. **Content Script (LinkedIn)**
   - Runs on `https://www.linkedin.com/*`.
   - Starts at `document_start` to enable pre-classification hiding.
   - Detects posts using `MutationObserver`.
   - Extracts `post_id`, `author_id`, `author_name`, `nodes`, and `attachments`.
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

No options page is required in v0.1.

## Storage keys (sync)

```ts
type Storage = {
  jwt?: string;            // session token
  enabled: boolean;        // default true
};
```

## Post extraction (required)

For each feed post element:

- `post_id`:
  - Use LinkedIn’s stable ID if present, else derive (see below)
- `author_id`:
  - profile URL or stable author identifier if present
- `author_name`:
  - visible author name text (best-effort)
- `nodes`:
  - ordered text nodes (`root` first, then nested repost nodes in DOM order)
  - each node includes: `id`, `parent_id`, `kind`, `text`
- `attachments`:
  - zero or more items tied to `node_id`
  - parser may emit attachment refs (image `src`; pdf `iframe_src` / `container_data_url` / `source_hint`)
  - background resolver converts refs into canonical payloads:
    - `image` attachments include `sha256`, `mime_type`, `base64`
    - `pdf` attachments include `source_url` and optional `excerpt_text`

### Derived post_id

If no native post id exists:

- `post_id = hex(SHA-256(author_id + "\n" + JSON.stringify(nodes)))`

### Canonical payload requirements

- preserve deterministic node and attachment ordering when building request payloads
- the extension does not compute `content_fingerprint`
- backend computes global `content_fingerprint` for cache lookups from canonical payload content

## Classification flow (required)

Content script → background:

```ts
chrome.runtime.sendMessage({
  type: "CLASSIFY_BATCH",
  posts: [{ post_id, author_id, author_name, nodes, attachments }]
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
    decision?: "keep" | "dim" | "hide",
    source?: "llm" | "cache" | "error",
    error?: "quota_exceeded"
  }
}
```

The content script uses a fail-open timeout (`3000ms` baseline). If no decision arrives in time, it renders `keep`.

## Applying decisions (required)

- **keep**: no changes
- **dim**:
  - apply CSS: `opacity: 0.35`
- **hide**:
  - keep the LinkedIn post node mounted
  - collapse it with CSS (`display: none`, no visible replacement text/stub)
  - do not remove/unmount the node to reduce rerender churn

## Pre-classification behavior

- While filtering is enabled, unprocessed post nodes are hidden until a decision is applied.
- The preclassify gate is enabled synchronously at content-script bootstrap on feed routes.
- Processed `keep` and `dim` posts become visible once marked processed.
- This prevents "appear then disappear" flicker for posts that end up hidden.

## Failure modes (required)

- If classify fails, returns 429, or returns invalid payload:
  - treat as `decision="keep"`
- Never throw uncaught errors that break LinkedIn rendering.
