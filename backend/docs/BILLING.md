# Billing Operations Guide

Operational reference for Polar checkout + webhook handling in the backend.

## Required Environment

- `POLAR_ENV` (`sandbox` or `production`)
- `POLAR_API_KEY`
- `POLAR_PRODUCT_ID`
- `POLAR_WEBHOOK_SECRET`
- `APP_URL`

## Checkout Flow

1. Client calls `POST /v1/billing/create-checkout` with auth.
2. Backend resolves monthly recurring price for `POLAR_PRODUCT_ID`.
3. Backend creates Polar checkout session with `metadata.user_id`.
4. Response: `{ "checkout_url": "..." }`.

Guardrails:

- active Pro users get `409 { "error": "already_pro" }`
- checkout API failures return `500 { "error": "checkout_failed" }`

## Webhook Flow

Endpoint: `POST /v1/billing/polar/webhook`

Processing steps:

1. Read raw body and required webhook headers.
2. Verify signature with `@polar-sh/sdk/webhooks.validateEvent`.
3. Use `webhook-id` header as idempotency key in `webhook_deliveries`.
4. If duplicate key exists: ack and no-op.
5. Apply subscription state transition.
6. On processing failure: delete idempotency claim and return non-2xx so Polar retries.

## Subscription State Mapping

- `subscription.created` (when status is active) => `plan=pro`, `plan_status=active`
- `subscription.active` => `plan=pro`, `plan_status=active`
- `subscription.uncanceled` => `plan=pro`, `plan_status=active`
- `subscription.canceled` => `plan=pro`, `plan_status=canceled`
- `subscription.updated`:
  - `active|trialing` => active
  - `canceled` => canceled
  - `past_due|unpaid` => past_due
- `subscription.revoked` => `plan=free`, `plan_status=inactive`

## Manual Validation Checklist

1. Trigger checkout in sandbox and complete payment.
2. Verify user state via `GET /v1/me`.
3. Re-deliver same webhook in Polar dashboard and confirm no duplicate state side effects.
4. Force transient DB failure and verify webhook returns non-2xx.
5. Confirm retry eventually succeeds and final user state is correct.

## Troubleshooting

### Signature failures

- confirm endpoint secret matches `POLAR_WEBHOOK_SECRET`
- ensure raw request body is verified (no JSON re-serialization)

### Duplicate processing

- inspect `webhook_deliveries` for repeated `webhook_id`
- confirm webhook route is using header idempotency, not payload-only keying

### User not updated

- ensure checkout metadata includes `user_id`
- inspect backend logs for `billing_webhook_processing_failed`
- verify payload contains subscription `id` and metadata `user_id`
