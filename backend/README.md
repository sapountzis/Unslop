# Backend

## Purpose

Backend API for Unslop:

- Magic-link auth and JWT sessions
- Classification endpoints (`/v1/classify`, `/v1/classify/batch`)
- Feedback ingestion
- Usage/stats endpoints
- Polar checkout + webhook handling

## Quality Guardrails

All backend changes must satisfy these constraints:

- No `any` in production backend code.
- Runtime environment reads come from one config module.
- Routes are transport-only (validation/auth + response mapping); no direct DB queries in routes.
- Domain literals (decisions, plans, statuses, feedback labels, event types) come from shared constants/enums.
- External collaborators (`db`, logger, clock, fetch/SDK clients, config) are injected explicitly through app/service wiring.

## Verification

From `backend/`:

- `bun run type-check`
- `bun run test:unit`
- `bun run test:integration`
- `bun run test:e2e`
