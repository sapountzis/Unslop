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
   - Detects posts using `MutationObserver`.
   - Extracts `post_id`, `author_id`, `author_name`, `content_text`.
   - Sends post to background for classification.
   - Applies the returned decision to the DOM.

2. **Background Service Worker**
   - Stores JWT and enabled toggle in `chrome.storage.sync`.
   - Calls backend endpoints:
     - `/v1/classify`
     - `/v1/feedback`
     - `/v1/me`
     - `/v1/auth/start`
     - `/v1/billing/create-checkout`
   - Handles 401 by clearing token and notifying popup.

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
- `content_text`:
  - visible post text only (no HTML), normalized + truncated

### Normalization + truncation (must match `data_model.md`)

1. Extract full visible post text.
2. Normalize: lowercase, collapse whitespace, trim.
3. Truncate to 4000 characters.
4. Use this truncated normalized text as `content_text`.

### Derived post_id

If no native post id exists:

- `post_id = hex(SHA-256(author_id + "\n" + content_text))`

## Classification flow (required)

Content script → background:

```ts
chrome.runtime.sendMessage({
  type: "CLASSIFY_POST",
  post: { post_id, author_id, author_name, content_text }
});
```

Background → backend:
- `POST /v1/classify` with JWT bearer token

Background → content script response:

```ts
{
  post_id: string,
  decision: "keep" | "dim" | "hide",
  source: "llm" | "cache" | "error"
}
```

## Applying decisions (required)

- **keep**: no changes
- **dim**:
  - apply CSS: `opacity: 0.35`
- **hide**:
  - replace the post element with a stub:
    - “Unslop hid a post · Show”
  - clicking “Show” reveals the post once (local only)

## Feedback (in-scope)

Background calls `POST /v1/feedback` with:

- `post_id`
- `rendered_decision` (what was applied)
- `user_label` (`should_keep` / `should_hide`)

## Failure modes (required)

- If classify fails, returns 429, or returns invalid payload:
  - treat as `decision="keep"`
- Never throw uncaught errors that break LinkedIn rendering.
