# Attachment + Preclassify Architecture

## Boundaries

- `src/content/attachment-controller.ts`
  - Owns feed/body observer lifecycle.
  - Exposes idempotent `ensureAttached({ routeKey, force })`.
  - Owns liveness (`isLive`) and generation checks.
- `src/content/preclassify-gate.ts`
  - Sole owner of preclassify DOM gate toggling.
  - Enables sync bootstrap and async enabled-state reconciliation.
- `src/content/linkedin.ts`
  - Orchestrates route sync, watchdog ticks, mutation buffering, and classification flow.
  - Does not directly mutate preclassify DOM attributes.

## Runtime Invariants

- On feed routes, either feed observer or body observer is attached.
- A stale/disconnected feed root forces reattach on next sync.
- Preclassify gate is enabled synchronously at content-script bootstrap on feed routes.
- Every processed post reaches terminal state via `data-unslop-processed`.
- Hide decisions keep LinkedIn nodes mounted and collapse them with `display: none`.

## Troubleshooting

### No backend calls after navigation

1. Confirm current route key is feed (`/feed/`).
2. Check attachment controller state: `feedObserverActive || bodyObserverActive` must be true.
3. If observer is not live, watchdog should force `ensureAttached({ force: true })`.
4. Verify feed selector still resolves (`SELECTORS.feed`).

### Posts flash visible before hide

1. Confirm preclassify gate is set at bootstrap (`data-unslop-preclassify="true"`).
2. Confirm gate is only cleared when extension is disabled.
3. Confirm unprocessed feed selectors match current LinkedIn post roots.

### Infinite scroll adds empty space or no visible posts

1. Confirm hidden posts use `.unslop-hidden-post { display: none !important; }`.
2. Verify decisions eventually set `data-unslop-processed`.
3. Verify mutation buffer drain is running (no stalled RAF queue).
