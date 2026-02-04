# Billing Operations Guide

## Setup

1. Create Polar Sandbox organization: https://polar.sh/
2. Get access token: https://polar.sh/settings/access-tokens
3. Set environment variables:
   ```
   POLAR_ENV=sandbox
   POLAR_API_KEY=<your_sandbox_token>
   POLAR_WEBHOOK_SECRET=<webhook_secret_from_endpoint_creation>
   ```

## Testing Webhooks Manually

### 1. Create Test User

```bash
curl -X POST http://localhost:3000/v1/auth/start \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com"}'
```

Follow the magic link to get JWT, then extract from browser storage or use the `/v1/me` endpoint.

### 2. Create Checkout

```bash
curl -X POST http://localhost:3000/v1/billing/create-checkout \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{"plan": "pro-monthly"}'
```

Response: `{"checkout_url": "https://polar.sh/checkout/..."}`

### 3. Complete Checkout

1. Open the checkout_url in browser
2. Complete payment in Polar Sandbox (use test card)
3. Webhook should fire to your local server

### 4. Trigger Webhook via Polar Dashboard

For testing without full checkout flow:

1. Go to Polar Sandbox Dashboard → Subscriptions
2. Find your test subscription
3. Click "Cancel" to trigger `subscription.canceled`
4. Click "Reactivate" to trigger `subscription.uncancelled`

### 5. Verify User State

```bash
curl http://localhost:3000/v1/me \
  -H "Authorization: Bearer <jwt>"
```

Should show:
```json
{
  "user_id": "...",
  "email": "test@example.com",
  "plan": "pro",
  "plan_status": "active"
}
```

## Common Issues

### Webhook not received
- Check server is running and accessible publicly (use ngrok for local)
- Verify webhook secret matches
- Check Polar Dashboard → Webhooks → Deliveries for error logs

### User stays "inactive" after payment
- Check console logs for webhook processing errors
- Verify `user_id` is in checkout metadata
- Check `webhook_deliveries` table for failed attempts

### Duplicate webhook processing
- Verify idempotency layer is working
- Check `webhook_deliveries` table for duplicate records
