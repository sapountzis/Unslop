# ARCHITECTURE

## Purpose
This file defines the top-level architecture and dependency direction rules enforced by `tools/agent/arch_lint.ts`.

## System Packages
- `backend/`: API, auth, billing, quota, classification orchestration.
- `extension/`: MV3 runtime, platform plugins, popup/background logic.
- `frontend/`: Astro marketing and legal/support pages.

## Layering Rules

### Backend
Allowed direction:
`types -> config -> db -> repositories -> services -> runtime/routes`

Import dependency direction:
`runtime/routes -> services -> repositories -> db -> config -> types`

Rules:
- Routes are transport adapters.
- Services hold business logic.
- `db` contains low-level database setup primitives only.
- Repositories hold persistence logic.
- `src/lib` is shared utility code and must not depend on repositories/services/runtime.
- Backward imports are forbidden.

### Extension
Allowed direction:
`types/lib -> platforms/* -> content runtime/background/popup wiring`

Rules:
- Platform-specific selectors/parsers/route logic must remain under `src/platforms/*`.
- Shared utilities must not import platform-specific modules.

## Cross-Cutting Concerns
Auth, telemetry, feature flags, provider SDKs, and external connectors must pass through explicit boundaries, not ad-hoc imports.

## Taste Invariants
- Validate external data at boundaries.
- Prefer shared utilities over duplicated helpers.
- Keep modules small and composable.
- Write lint errors with remediation guidance for future agents.
