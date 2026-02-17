# Extension Debug Guide

Use this when classification does not trigger or decisions are not applied.

## Diagnostic Signals

Primary signal source: popup `Run Diagnostics`.

Key checks and owners:
- `service_worker_reachable`: `extension/src/background/index.ts`, `extension/src/background/message-router.ts`
- `storage_enabled`, `storage_jwt_present`: `extension/src/background/storage-facade.ts`
- `content_ping`, `content_script_loaded`: platform entry + `extension/src/content/runtime.ts`
- `feed_root_found`, `candidate_posts_found`, `post_identity_ready`: `extension/src/platforms/*/{selectors,surface,parser}.ts`
- `runtime_processing_enabled`, `observer_live`, `runtime_markers_progress`: `extension/src/content/runtime.ts`

## Message Contract Map

- `CLASSIFY_BATCH`
  - producer: `extension/src/content/batch-dispatcher.ts`
  - consumer: `extension/src/background/handlers.ts`
- `CLASSIFY_BATCH_RESULT`
  - producer: `extension/src/background/classification-service.ts`
  - consumer: `extension/src/content/runtime.ts` -> `BatchDispatcher.handleResult`
- `GET_RUNTIME_DIAGNOSTICS`
  - producer: popup diagnostics client
  - consumer: `extension/src/background/handlers.ts`
- `GET_CONTENT_DIAGNOSTICS`
  - producer: popup diagnostics client via `chrome.tabs.sendMessage`
  - consumer: `extension/src/content/runtime.ts`

## Symptom Playbook

### `/me` works but no classify traffic

1. Run diagnostics on `https://www.linkedin.com/feed/`.
2. Confirm `content_ping=pass`.
3. If `candidate_posts_found=0`, inspect platform selectors against live DOM.
4. If `post_identity_ready=0/x`, inspect `surface.ts` identity extraction.
5. If markers stay `checking=0 processed=0`, inspect `runtime.ts` processing gates and observer attach path.
6. If pending batch grows without results, inspect:
   - content dispatch: `batch-dispatcher.ts`
   - background classify: `classification-service.ts`, `classify-pipeline.ts`

### Diagnostics fails at `content_ping`

1. Verify extension has site access for LinkedIn.
2. Reload LinkedIn tab and rerun diagnostics.
3. Verify content script entry exists in `manifest.json`.

### Candidate posts found but identity extraction fails

1. Validate selectors in `extension/src/platforms/linkedin/selectors.ts`.
2. Validate `resolvePostSurface` invariants in `extension/src/platforms/linkedin/surface.ts`.
3. Re-run parser/surface tests.

### Classify responses arrive but hide is not applied

1. Inspect `pending-decision-coordinator.ts` for stale identity guards.
2. Inspect `render-commit-pipeline.ts` queue/actionable state.
3. Inspect `decision-renderer.ts` mode handling (`collapse` vs `label`).

## Useful Tests

- `bun test extension/src/content/*.test.ts`
- `bun test extension/src/background/*.test.ts`
- `bun test extension/src/popup/*.test.ts`
