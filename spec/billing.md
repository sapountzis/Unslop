# Billing & Plans (v0.1)

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

State updates:

- activation/uncancel => `plan='pro'`, `plan_status='active'`
- canceled => `plan='pro'`, `plan_status='canceled'`
- past_due/unpaid (via updated) => `plan='pro'`, `plan_status='past_due'`
- revoked => `plan='free'`, `plan_status='inactive'`

Webhook processing persists idempotency records in `webhook_deliveries`.

## Plan Status Semantics

- Pro access is enabled only when:
  - `plan='pro' AND plan_status='active'`
- non-active states (`canceled`, `past_due`, `inactive`) do not grant Pro quota.

## Out of Scope

- Multiple plans, annual plans, add-ons, metered billing
- Customer portal/proration UX
- Order-level fulfillment workflows
