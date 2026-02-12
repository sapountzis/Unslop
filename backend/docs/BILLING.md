# Billing Operations Guide

Operational reference for Polar checkout + webhook handling.

## Config source

Billing runtime values come from `src/config/runtime.ts`:

- `POLAR_ENV`
- `POLAR_API_KEY`
- `POLAR_PRODUCT_ID`
- `POLAR_WEBHOOK_SECRET`
- `APP_URL`

Application wiring is in `src/app/dependencies.ts`.

## Checkout flow

1. Client calls `POST /v1/billing/create-checkout` with auth.
2. Backend checks current user plan/status.
3. Backend resolves monthly recurring price for `POLAR_PRODUCT_ID` (cached in memory for 1 hour).
4. Backend creates Polar checkout session with `metadata.user_id`.
5. Response: `{ "checkout_url": "..." }`.

Guardrails:

- active Pro user -> `409 { "error": "already_pro" }`
- checkout creation failure -> `500 { "error": "checkout_failed" }`

## Auth-time billing recovery sync

On `POST /v1/auth/start`, the backend performs a best-effort Polar sync by email
for both newly created and existing users before sending the magic link.

Flow:

1. Query Polar customers by email (`GET /v1/customers?email=<normalized>&limit=1`).
2. If customer exists, fetch customer state (`GET /v1/customers/{id}/state`).
3. Find active subscription for configured `POLAR_PRODUCT_ID`.
4. If found, set local plan/tier fields from Polar state (`plan`, `plan_status`, subscription ids, period bounds).
5. If sync fails, auth flow continues (warning log only), so login is not blocked by Polar outages.

## Webhook flow

Endpoint: `POST /v1/billing/polar/webhook`

Processing steps:

1. Read raw body and required webhook headers.
2. Verify signature with `@polar-sh/sdk/webhooks.validateEvent`.
3. Filter to supported subscription event types.
4. Claim idempotency using `webhook-id` header in `webhook_deliveries`.
5. Normalize `event.data` with `src/services/polar-webhook-schema.ts` (camelCase SDK shape + snake_case aliases).
6. Apply subscription transition in `src/services/polar.ts`.
7. On processing failure, release idempotency claim and return non-2xx so Polar retries.

## Subscription state mapping

- `subscription.created` (when `status=active`) -> `plan=pro`, `plan_status=active`
- `subscription.active` -> `plan=pro`, `plan_status=active`
- `subscription.uncanceled` -> `plan=pro`, `plan_status=active`
- `subscription.canceled` -> `plan=pro`, `plan_status=canceled`
- `subscription.past_due` -> `plan=pro`, `plan_status=past_due`
- `subscription.updated`:
  - `active|trialing` -> active
  - `canceled` -> canceled
  - `past_due|unpaid` -> past_due
  - other statuses -> ignored
- `subscription.revoked` -> `plan=free`, `plan_status=inactive`

## Quota period anchors

- Free users: monthly window anchored to `users.created_at` (UTC day/time).
- Pro active users: use `subscription_period_start` + `subscription_period_end`.
- Pro canceled users keep Pro quota until `subscription_period_end`.
- Revoked/expired/past-due states use free anchor semantics.

## Idempotency contract

- Primary key: `webhook_deliveries.webhook_id`
- Source key: `webhook-id` header from Polar
- Duplicate delivery: acknowledged with no state mutation
- Processing failure: claim is deleted and request returns non-2xx for retry

## Validation checklist

1. Trigger sandbox checkout and complete payment.
2. Confirm user plan via `GET /v1/me`.
3. Re-deliver same webhook from Polar dashboard; confirm no duplicate side effects.
4. Simulate transient failure; confirm non-2xx and subsequent retry success.
5. Confirm logs do not include webhook secrets/tokens.
