# Billing & Plans (v0.1)

## Provider

- **Polar** is the Merchant of Record.
- Backend creates checkout sessions and consumes Polar webhooks to update user plan status.

## Plans

### Free

- Price: €0 / month
- Monthly quota: `FREE_MONTHLY_LLM_CALLS` teacher calls (default 300)
- Behavior when quota exceeded:
  - `/v1/classify` returns HTTP `429` with `{ "error": "quota_exceeded" }`

### Pro

- Price: €3.99 / month
- Monthly quota: `PRO_MONTHLY_LLM_CALLS` teacher calls (default 10,000)
- Behavior when quota exceeded:
  - Same as Free (429). Rare; mainly a safety cap.

## What counts as usage

**Usage unit:** 1 teacher LLM call for a post that is not served from cache.

- Cache hit (fresh row in `posts`) → usage does not increase.
- Cache miss → usage += 1 (after a successful LLM call attempt).

## Polar integration (minimal)

### Backend endpoint

- `POST /v1/billing/create-checkout`
  - Auth required
  - Returns a `checkout_url`

### Webhook endpoint

- `POST /v1/billing/polar/webhook`
  - Verifies signature via `POLAR_WEBHOOK_SECRET`
  - **Handles the following Polar events**:
    - `subscription.created` → activate Pro subscription.
    - `subscription.updated` → inspect `data.status`:
      - `active` (and `cancel_at_period_end: false`) → (re)activate Pro.
      - `canceled` → deactivate subscription (`planStatus='inactive'`).
      - `past_due` → deactivate subscription (`planStatus='inactive'`).
      - `revoked` → deactivate subscription (`planStatus='inactive'`).
  - Updates `users.plan`, `users.plan_status`, `users.polarCustomerId`, `users.polarSubscriptionId`, `users.subscriptionPeriodStart`, `users.subscriptionPeriodEnd`.
  - Stores each processed webhook in `webhookDeliveries` table to guarantee **idempotent** handling.

### Plan status semantics

- `active` → user currently has a valid Pro subscription
- `inactive` → user does not

Pro is enabled iff `plan='pro' AND plan_status='active'`.

## Out of scope

- Customer portal links, proration, upgrades/downgrades UI
- Multiple plans, annual billing, add‑ons, metered billing
- Detailed handling of `order.created` beyond optional logging


Billing is required in v0.1 because usage quotas depend on subscription status.

## Provider

- **Polar** is the Merchant of Record.
- Backend creates checkout sessions and consumes Polar webhooks to update user plan status.

## Plans

### Free

- Price: €0 / month
- Monthly quota: `FREE_MONTHLY_LLM_CALLS` teacher calls (default 300)
- Behavior when quota exceeded:
  - `/v1/classify` returns HTTP `429` with `{ "error": "quota_exceeded" }`

### Pro

- Price: €3.99 / month
- Monthly quota: `PRO_MONTHLY_LLM_CALLS` teacher calls (default 10,000)
- Behavior when quota exceeded:
  - Same as Free (429). Rare; mainly a safety cap.

## What counts as usage

**Usage unit:** 1 teacher LLM call for a post that is not served from cache.

- Cache hit (fresh row in `posts`) → usage does not increase.
- Cache miss → usage += 1 (after a successful LLM call attempt).

## Polar integration (minimal)

### Backend endpoint

- `POST /v1/billing/create-checkout`
  - Auth required
  - Returns a `checkout_url`

### Webhook endpoint

- `POST /v1/billing/polar/webhook`
  - Verifies signature via `POLAR_WEBHOOK_SECRET`
  - Updates `users.plan` and `users.plan_status`

Plan status semantics:

- `active` → user currently has a valid Pro subscription
- `inactive` → user does not

Pro is enabled iff `plan='pro' AND plan_status='active'`.

## Out of scope

- Customer portal links, proration, upgrades/downgrades UI
- Multiple plans, annual billing, add-ons, metered billing
