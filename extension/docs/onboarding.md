# Extension Onboarding

This document is the fastest way to build a mental model of the extension runtime.

## Product Contract

Reference specs:
- `docs/product-specs/extension.md`
- `docs/product-specs/spec.md`

Core runtime guarantees:
- classify posts as `keep | hide`
- fail open on runtime/network errors
- keep supported feed browsing stable under dynamic DOM updates

## Entry Points

1. `extension/manifest.json`
   - Declares background worker and platform content-script entrypoints.
2. `extension/src/platforms/<platform>/index.ts`
   - Starts runtime: `createPlatformRuntime(plugin)`.
3. `extension/src/platforms/<platform>/plugin.ts`
   - Binds parser, surface resolver, selectors, and route detector.
4. `extension/src/content/runtime.ts`
   - Shared content runtime orchestration for all platforms.
5. `extension/src/background/index.ts`
   - Registers message router + handlers.
6. `extension/src/popup/App.ts`
   - Popup UI shell; delegates diagnostics execution to `diagnostics-client.ts`.

## Runtime Pipeline

1. Feed route becomes eligible.
2. `runtime.ts` enables preclassify gate.
3. `attachment-controller.ts` attaches feed/body observers.
4. Candidate nodes are normalized via platform `resolvePostSurface`.
5. `mutation-buffer.ts` batches candidate processing.
6. Parser produces canonical `PostData` (`nodes[]`, `attachments[]` refs).
7. `batch-dispatcher.ts` batches classify requests and tracks pending `post_id` promises.
8. Background receives `CLASSIFY_BATCH`, runs classification service, streams `CLASSIFY_BATCH_RESULT`.
9. `pending-decision-coordinator.ts` + `render-commit-pipeline.ts` apply decisions in DOM order.
10. `decision-renderer.ts` commits `keep|hide` using selected hide mode.

## Ownership Map

- Platform-specific DOM logic: `extension/src/platforms/*`
- Content runtime orchestration: `extension/src/content/runtime.ts`
- Content queue/message boundary: `extension/src/content/batch-dispatcher.ts`
- Background message routing: `extension/src/background/message-router.ts`
- Background handlers (auth/billing/diagnostics/classify entry): `extension/src/background/handlers.ts`
- Background classify orchestration: `extension/src/background/classification-service.ts` + `extension/src/background/classify-pipeline.ts`
- Shared background storage access: `extension/src/background/storage-facade.ts`
- Popup diagnostics orchestration: `extension/src/popup/diagnostics-client.ts`

## First Debug Path For New Contributors

When feed posts are not getting classified:
1. Run popup diagnostics button on `https://www.linkedin.com/feed/`.
2. If background fails, inspect `background/index.ts` registration and `handlers.ts`.
3. If content ping fails, inspect platform entry and content script host permissions.
4. If identity extraction fails, inspect platform `selectors.ts` and `surface.ts`.
5. If pending batch grows, inspect `batch-dispatcher.ts` and background classify flow.
