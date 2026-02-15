# Extension Quality Audit - 2026-02-06

## Verification

Executed:
- `bun test ./src/lib/enabled-state.test.ts`
- `bun test ./src/content/classification-timeout.test.ts`
- `bun test ./src/content/preclassify-selectors.test.ts`
- `bun test ./src/content/decision-renderer.test.ts`
- `bun test ./src/content/linkedin-parser.test.ts`
- `bun test ./src/background/ndjson.test.ts`
- `bun run build`
- `rg -n "CLASSIFY_POST|SEND_FEEDBACK|AUTH_REQUIRED|UNSLOP_AUTH_SUCCESS|FEED_POLL_INTERVAL_MS|feedObserved" extension/src`

All tests/build passed. Dead-reference sweep returned no matches.

## Resolved Findings

1. Enabled default semantics were inconsistent across popup/background/content.
   - Fixed with shared helper: `src/lib/enabled-state.ts`.
   - Wired into popup, background, and user-data service.

2. Pre-classification hide coverage did not fully match post detection selectors.
   - Aligned to both `.feed-shared-update-v2` and `[data-urn]`.
   - Added regression test: `src/content/preclassify-selectors.test.ts`.

3. Classification timeout was too low for observed runtime latency.
   - Set `CLASSIFY_TIMEOUT_MS` to `2000`.
   - Added timeout baseline test.

4. DOM parsing and rendering responsibilities were mixed.
   - Extracted renderer: `src/content/decision-renderer.ts`.
   - Kept parser extraction-focused: `src/content/linkedin-parser.ts`.

5. Dead runtime message paths and stale auth event flow existed.
   - Removed `CLASSIFY_POST`, `SEND_FEEDBACK`, `AUTH_REQUIRED`, `UNSLOP_AUTH_SUCCESS` paths from extension runtime.
   - Centralized active runtime message contracts in `src/lib/messages.ts`.

6. Unused constants/attributes/methods remained in shared modules.
   - Removed `FEED_POLL_INTERVAL_MS`, `feedObserved`, and unused service methods.

7. Shared CSS contained dead utility/selectors.
   - Removed unused `mb-10`, `mb-12`, `divider`, and legend selectors.

8. `.ts` and checked-in `.js` drift risk under `src/`.
   - Set TS compile to `noEmit`.
   - Removed checked-in/generated `.js` files under `src/`.
   - Documented policy in `extension/README.md`.

9. Spec drift from implementation.
   - Updated `docs/product-specs/extension.md` for batch classify flow, pre-hide behavior, timeout fail-open behavior, and hide-without-stub UX.

10. Extension architecture boundaries were undocumented.
    - Added `extension/docs/constitution.md`.
    - Linked as binding in `extension/AGENTS.md`.

## Intentional Deferrals

- No new feature work was added (no heuristics, no per-author tuning, no UI expansion).
- No backend contract expansion was performed.

## Residual Risks

1. LinkedIn DOM changes can still break selector-based extraction.
   - Mitigation: keep parser and selector tests updated when selectors change.
2. Pre-hide strategy depends on decision latency staying near current range.
   - Mitigation: monitor runtime classify p95/p99 before lowering timeout.
