# Attachment + Preclassify Architecture

## Boundaries

- `src/content/attachment-controller.ts`
  - Owns feed/body observer lifecycle.
  - Exposes idempotent `ensureAttached({ routeKey, force })`.
  - Owns liveness (`isLive`) and generation checks.
- `src/content/runtime.ts`
  - Shared runtime orchestrator across LinkedIn/X/Reddit.
  - Owns preclassify gate toggling, runtime reconcile, mutation buffering, and render commit handoff.
- `src/platforms/<platform>/parser.ts`
  - Produces multimodal post payload primitives for each platform:
    - `nodes[]` (deterministic ordering)
    - `attachments[]` references (image/pdf metadata only)
  - Does not fetch binary payloads in content script context.
- `src/content/batch-dispatcher.ts`
  - Owns classify request batching and `post_id` pending promise map.
  - Resolves pending entries from streamed background results.
- `src/background/attachment-resolver.ts`
  - Resolves attachment refs before API classify call.
  - Image path: fetches bytes, enforces max size, computes sha256 + base64.
  - PDF path: best-effort excerpt extraction with bounded bytes/chars.
  - Fail-open: attachment-level failures are dropped, post remains classifiable.

## Runtime Invariants

- On feed routes, either feed observer or body observer is attached.
- A stale/disconnected feed root forces reattach on next sync.
- Preclassify gate is enabled synchronously at content-script bootstrap on feed routes.
- Preclassify gate is disabled only on disabled/non-feed transitions.
- Every processed post reaches terminal state via `data-unslop-processed`.
- Hide decisions keep LinkedIn nodes mounted and collapse them with `display: none`.
- Classification payload from extension is multimodal (`nodes` + `attachments`), not legacy text-only.
- Attachment resolver runs in background and requires `https://media.licdn.com/*` host permission.
- Attachment parse/fetch failures never break feed rendering; system fails open.

## Troubleshooting

### No backend calls after navigation

1. Confirm current route key is feed (`/feed/`).
2. Check attachment controller state: `feedObserverActive || bodyObserverActive` must be true.
3. If observer is not live, watchdog should force `ensureAttached({ force: true })`.
4. Verify feed selector still resolves (`SELECTORS.feed`).

### Posts flash visible before hide

1. Confirm preclassify gate is set at bootstrap (`data-unslop-preclassify="true"`).
2. Confirm gate is only cleared when extension is disabled.
3. Confirm unprocessed feed selectors match current LinkedIn post roots (`src/platforms/linkedin/selectors.ts`).

### Attachments expected but missing in classify payload

1. Confirm parser is extracting attachment refs:
   - image: `.update-components-image__image`
   - PDF container: `.update-components-document__container`
   - PDF iframe: `.document-s-container__document-element`
   - implementation: `src/platforms/linkedin/parser.ts`
2. Confirm manifest host permission includes `https://media.licdn.com/*`.
3. Confirm background resolver limits are not exceeded:
   - `MAX_IMAGE_BYTES`
   - `MAX_PDF_FETCH_BYTES`
   - `MAX_PDF_EXCERPT_CHARS`
4. For attachment resolution failures, expect classify to continue with reduced payload.

### Infinite scroll adds empty space or no visible posts

1. Confirm hidden posts use `.unslop-hidden-post { display: none !important; }`.
2. Verify decisions eventually set `data-unslop-processed`.
3. Verify mutation buffer drain and dispatcher queue are running (`src/content/runtime.ts`, `src/content/batch-dispatcher.ts`).
