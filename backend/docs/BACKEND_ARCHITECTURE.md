# Backend Architecture

## Design goals

- Keep routes transport-only.
- Keep business logic in services.
- Keep DB access in repositories.
- Keep runtime config and policy/domain constants centralized.
- Keep external collaborators explicitly injected from one composition root.

## Runtime composition

Main wiring happens in:

- `src/app/dependencies.ts`
- `src/app/create-app.ts`

`createDependencies()` builds concrete collaborators (`db`, logger, auth middleware, repositories, services).
`createApp(deps)` registers middleware/routes using those injected collaborators.

This keeps business logic testable without hidden globals.

## Layer boundaries

### Routes (`src/routes/*`)

Routes may:

- validate request payloads
- enforce auth middleware
- call service functions
- map domain outcomes to HTTP responses

Routes must not:

- query DB directly
- read `process.env`
- hold business rules

### Services (`src/services/*`)

Services orchestrate domain behavior:

- auth flow (magic-link start/callback completion)
- classification flow (cache -> quota -> LLM -> persist)
- quota and quota-context rules
- stats response assembly
- billing transitions and idempotency handling

Services consume injected dependencies (`db` wrappers, logger, clock, fetch clients, config).

### Repositories (`src/repositories/*`)

Repositories are DB-only helpers:

- no HTTP concerns
- no route-context dependencies
- narrow query interfaces for services

## Config strategy

`src/config/runtime.ts` is the only module that reads environment variables.

It provides typed runtime groups:

- `server`
- `db`
- `llm`
- `billing`
- `quotas`
- `auth`
- `email`
- `classification`

No production module should read `process.env` directly.

## Constants ownership

### Domain literals

`src/lib/domain-constants.ts` owns shared literal sources:

- decisions
- feedback labels
- plans and plan statuses
- Polar subscription event/status literals

### Policy numbers

`src/lib/policy-constants.ts` owns behavior-sensitive numbers:

- content max length
- batch limits
- token lifetimes
- retry settings/timeouts
- cache TTLs
- quota defaults

## Webhook typing and idempotency

Billing webhook flow:

1. Verify signature with Polar SDK.
2. Claim idempotency with `webhook-id` in `webhook_deliveries`.
3. Normalize `event.data` with `src/services/polar-webhook-schema.ts`.
4. Apply plan transition in billing service.
5. On failure, release claim and return non-2xx for retry.

This keeps retries safe and prevents duplicate side effects.
