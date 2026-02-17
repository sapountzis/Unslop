# Extension Debug Guide

Use this when classification does not trigger or decisions are not applied.

## Diagnostic Signals

Primary signal source: popup `Run Diagnostics`.

Key checks and owners:
- `service_worker_reachable`: `extension/src/background/index.ts`, `extension/src/background/message-router.ts`
- `developer_mode_enabled`: popup dev-mode toggle + `extension/src/lib/dev-mode.ts`
- `storage_enabled`, `storage_jwt_present`: `extension/src/background/storage-facade.ts`
- `active_tab_supported_platform`: `extension/src/background/runtime-diagnostics.ts`, `extension/src/platforms/registry.ts`
- `backend_reachable`: `extension/src/background/runtime-diagnostics.ts`
- `content_script_reachable`: `extension/src/content/diagnostics-host.ts`
- `platform_*` checks (route/feed/candidates/identity/markers): `extension/src/platforms/*/diagnostics.ts`

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
  - consumer: `extension/src/content/diagnostics-host.ts`

## Symptom Playbook

### `/me` works but no classify traffic

1. Run diagnostics on a supported feed route.
2. Confirm `content_script_reachable=pass`.
3. If `platform_candidate_posts_found` is warn/fail, inspect platform selectors against live DOM.
4. If `platform_identity_ready` is fail (`0/x`), inspect `surface.ts` identity extraction.
5. If `platform_marker_progress` stays warn, inspect `runtime.ts` processing gates and observer attach path.
6. If pending batch grows without results, inspect:
   - content dispatch: `batch-dispatcher.ts`
   - background classify: `classification-service.ts`, `classify-pipeline.ts`

### Diagnostics fails at `content_script_reachable`

1. Verify extension has site access for the active platform host.
2. Reload active tab and rerun diagnostics.
3. Verify content script entry exists in `manifest.json`.

### Candidate posts found but identity extraction fails

1. Validate selectors in `extension/src/platforms/<platform>/selectors.ts`.
2. Validate `resolvePostSurface` invariants in `extension/src/platforms/<platform>/surface.ts`.
3. Re-run parser/surface tests.

### Classify responses arrive but hide is not applied

1. Inspect `pending-decision-coordinator.ts` for stale identity guards.
2. Inspect `render-commit-pipeline.ts` queue/actionable state.
3. Inspect `decision-renderer.ts` mode handling (`collapse` vs `label`).

## Useful Tests

- `bun test extension/src/content/*.test.ts`
- `bun test extension/src/background/*.test.ts`
- `bun test extension/src/popup/*.test.ts`
