# Extension Constitution

This document is binding for changes under `extension/`.

## Scope and Product Boundaries

The extension remains minimal and spec-driven:
- detect LinkedIn posts, request decision, apply `keep|dim|hide`
- support auth, subscription, usage, and stats display
- fail open on every runtime or network error

Out of scope:
- heuristic classifiers or local model logic
- per-author tuning/rules
- analytics/dashboard feature expansion beyond existing stats view

## Architectural Boundaries

Separation of concerns is required:
- `src/background/`: message transport and backend API orchestration
- `src/content/`: LinkedIn DOM observation + post extraction + decision rendering
- `src/popup/` and `src/stats/`: UI only
- `src/lib/`: pure/shared helpers (selectors, storage helpers, config, contracts)

Rules:
- DOM parsing and DOM rendering must be separate modules.
- Message contracts must be centralized in one shared module.
- Storage defaults and normalization rules must be centralized.

## Type Safety and Contracts

- Prefer typed message requests/responses over ad-hoc string literals.
- Every runtime message type must have:
  - one exported constant
  - one typed request shape
  - one typed response shape (or explicit `void`)
- Keep fail-open response shapes explicit (`decision: "keep", source: "error"`).

## Simplicity and Cleanup Policy

- Remove dead code instead of leaving dormant branches.
- Remove unused exports, constants, and CSS selectors unless intentionally kept with a near-term reason.
- Keep one source of truth for implementation files (`.ts` in `src/`).

## Logging and Data Handling

- Never log secrets (`jwt`, API keys, auth payloads).
- Keep content-script logs minimal.
- Favor concise, structured error logs that preserve fail-open behavior.

## Quality Gates

Before merging extension changes:
1. `bun run build` passes in `extension/`
2. Relevant `bun:test` suites pass for touched behavior
3. Spec and docs reflect behavioral changes
4. No known dead references remain for removed paths

## Allowed / Encouraged / Prohibited

Allowed:
- targeted refactors that improve correctness and UX smoothness
- small, focused tests around changed behavior

Encouraged:
- single-responsibility modules with tight interfaces
- explicit constants for selectors, attributes, and message types

Prohibited:
- expanding product scope while doing maintenance work
- bypassing fail-open guarantees
- introducing parallel TS/JS source-of-truth drift
