---
owner: unslop
status: verified
last_verified: 2026-02-15
---

# Billing & Plans (v0.1)

## problem
The product needs deterministic free/pro entitlement behavior with quota enforcement and reliable subscription lifecycle handling.

## non_goals
- Multi-plan catalogs, annual plans, add-ons, or metered pricing complexity.
- Customer portal design or advanced billing operations beyond defined checkout/webhook flows.

## acceptance_criteria
- AC1: Free and Pro plans, quotas, and quota-exceeded behavior are explicitly defined.
- AC2: Checkout and webhook contracts are documented with idempotent processing rules.
- AC3: Plan-status semantics and quota period anchors are deterministic.

## constraints
- Performance: Quota checks must be fast and atomic on non-cached classification attempts.
- Security/Privacy: Webhook signature verification and idempotency are mandatory.
- Compatibility: Provider contract remains aligned with Polar events and payload normalization.

## telemetry
- Logs: Checkout creation, webhook verification failures, entitlement transitions.
- Metrics: Quota exceeded rates, webhook retries, active vs inactive plan distribution.
- Traces: Billing route and webhook processing spans.

## test_plan
- Unit: Plan status transitions and quota policy decisions.
- Integration: Checkout route, webhook idempotency, entitlement persistence.
- E2E: Upgrade flow and entitlement changes reflected in `/v1/me` and quota behavior.

## rollout
- Flags: No billing feature flags required for v0.1 baseline.
- Migration: Schema and entitlement changes ship with migration-safe updates.
- Backout: Disable or revert billing route changes and keep free-tier behavior intact.

## Provider

- Polar is the Merchant of Record.
- Backend creates checkout sessions and consumes Polar webhooks.

## Plans

### Free

- Price: EUR 0 / month
- Monthly quota: `FREE_MONTHLY_LLM_CALLS` (default 300)

### Pro

- Price: EUR 3.99 / month
- Monthly quota: `PRO_MONTHLY_LLM_CALLS` (default 10000)

Quota exhaustion behavior (both plans):

- `/v1/classify` returns `429` with `{ "error": "quota_exceeded" }`
- `/v1/classify/batch` emits per-item `{ "post_id": "...", "error": "quota_exceeded" }`

## What Counts as Usage

Usage unit: one attempted non-cached LLM classification.

- cache hit (`source=cache`) does not consume quota
- cache miss consumes quota atomically before LLM attempt

## Checkout Endpoint

- `POST /v1/billing/create-checkout`
- Auth required
- Request body: `{ "plan": "pro-monthly" }`
- Response: `{ "checkout_url": "..." }`
- Already-active Pro returns `409 { "error": "already_pro" }`

## Webhook Endpoint

- `POST /v1/billing/polar/webhook`
- Signature verification via `POLAR_WEBHOOK_SECRET`
- Header-based idempotency:
  - `webhook-id` is the idempotency key
  - duplicates are acknowledged and skipped
- Processing failures return non-2xx so Polar retries

Handled subscription events:

- `subscription.created` (only activates when payload status is active)
- `subscription.active`
- `subscription.updated`
- `subscription.uncanceled`
- `subscription.canceled`
- `subscription.revoked`
- `subscription.past_due`

Webhook payload normalization:

- webhook signatures are verified via Polar SDK `validateEvent`
- payload parsing accepts SDK camelCase fields (for example `customerId`, `currentPeriodStart`, `currentPeriodEnd`)
- snake_case aliases are also accepted for compatibility with raw/internal payload paths

State updates:

- activation/uncancel => `plan='pro'`, `plan_status='active'`
- canceled => `plan='pro'`, `plan_status='canceled'`
- past_due/unpaid (via updated or `subscription.past_due`) => `plan='pro'`, `plan_status='past_due'`
- revoked => `plan='free'`, `plan_status='inactive'`

Webhook processing persists idempotency records in `webhook_deliveries`.

## Plan Status Semantics

- Pro access is enabled only when:
  - `plan='pro' AND plan_status='active'`
  - `plan='pro' AND plan_status='canceled'` while `subscription_period_end > now()`
- non-active states after grace (`past_due`, `inactive`, canceled with expired `subscription_period_end`) do not grant Pro quota.

## Quota Period Anchors

- Free quota windows are anchored to `users.created_at` (UTC monthly cycle by account-creation day/time).
- Pro quota windows use Polar subscription window fields (`subscription_period_start`, `subscription_period_end`).
- If Pro access is inactive/expired, quota window falls back to free account-creation anchor semantics.

## Out of Scope

- Multiple plans, annual plans, add-ons, metered billing
- Customer portal/proration UX
- Order-level fulfillment workflows
