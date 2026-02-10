# AGENTS.md – Backend (Bun + Hono API)

You are working in the **backend** service.

Minimal responsibilities:

- Auth: email magic-link + JWT sessions.
- Classification: return **keep/hide** for a LinkedIn post.
- LLM calls: call a single configured model via an inference provider (e.g. OpenRouter).
- Persistence: store post decision + minimal metadata in Postgres.
- Feedback: store user feedback on rendered decisions.
- Billing: Polar checkout + webhook updates.
- Billing webhooks: signature verification + `webhook-id` idempotency.
- Usage quotas: enforce monthly teacher-call caps by plan.

Refer to:
- `../spec/api.md`
- `../spec/data_model.md`
- `../spec/billing.md`
- `../spec/ml.md`

## Backend constitution

This file defines mandatory rules for any backend change.
If a change violates these rules, it is not complete.

### 1) Architectural boundaries (mandatory)

- Routes are transport adapters only:
  - Validate input/auth.
  - Call service methods.
  - Map domain errors to HTTP responses.
- Services contain business rules and orchestration.
- Repositories contain database access only.
- Domain logic must not depend on Hono request/response objects.
- `process.env` access is allowed only in a dedicated runtime config module.
- External dependencies (`db`, logger, clock, API clients, config) must be injected explicitly; avoid hidden module-level singletons for business logic.

### 2) Type safety and API contracts (mandatory)

- No `any` in production code.
- Avoid unsafe casts and non-null assertions unless unavoidable and documented inline.
- Parse external payloads (webhooks, third-party responses) with schemas and explicit narrowing.
- Reuse shared domain literals/constants for decisions, plans, statuses, event types, and error codes.
- Public API response shapes must remain stable unless spec docs are updated in the same change.

### 3) Data and DB rules (mandatory)

- Use Drizzle models as source of truth for schema-level constraints.
- Keep schema constraints aligned with app invariants (FKs, checks, enums, indexes).
- Webhook processing must remain idempotent using `webhook-id` claim semantics.
- Write paths that update multiple related records should be transaction-safe.
- Do not add ad-hoc analytics/event tables or non-spec storage scope.

### 4) Simplicity and scope control (mandatory)

- Keep implementation minimal and spec-driven.
- Prefer small composable functions over broad utility layers.
- No speculative abstractions or framework churn without direct need.
- No model training, student model, heuristic classifier, author-level tuning, dashboards, or analytics UI.

### 5) Quality gates (enforcement)

A backend change is complete only if all are true:

- `bun run type-check` passes.
- Relevant tests pass:
  - unit tests for changed behavior,
  - integration tests for DB/billing/webhook/quota changes.
- New behavior has tests before or alongside implementation (TDD preferred).
- Docs are updated when contracts/policies/flows change:
  - billing changes -> `../spec/billing.md` and `../spec/api.md`,
  - data model changes -> `../spec/data_model.md`,
  - backend operational behavior changes -> `backend/docs/*.md` as needed.

### 6) Allowed / encouraged / prohibited

Allowed:
- Refactoring for clearer boundaries, stronger typing, and safer defaults.
- Adding focused constants/enums to remove duplicated literals.
- Adding repository/service methods that reduce coupling.

Encouraged:
- Dependency injection via an app composition root.
- Deterministic functions with explicit inputs/outputs.
- Centralized policy/config constants instead of magic numbers.
- Structured logging with sensitive-field redaction.

Prohibited:
- Direct secret logging or token emission in logs.
- Mixing route, domain, and DB concerns in one function.
- New raw SQL when Drizzle can express the query (unless benchmarked and justified).
- Hidden behavior behind implicit globals/environment reads in business logic.

## Setup & dev commands

From `backend/`:

- `bun install`
- `bun run dev`
- `bun run test` (deterministic unit tests only; no live DB/network/server)
- `bun run test:integration` (DB/service dependent tests)
- `bun run test:e2e` (requires running API server at `APP_URL`)
- `bun run type-check`

## Boundaries

- Do **not** add:
  - student models
  - heuristic classifiers
  - author-level heuristics
  - offline training scripts
  - dashboards

Classification should be “dumb”:
- Cache by `post_id` (with a simple TTL) to reduce duplicate LLM calls.
- Otherwise call the LLM and persist the decision.
