// Billing routes
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { validateEvent, WebhookVerificationError } from '@polar-sh/sdk/webhooks';
import {
  claimWebhookDeliveryById,
  createCheckoutSession,
  handleSubscriptionActive,
  handleSubscriptionCanceled,
  handleSubscriptionUncanceled,
  handleSubscriptionRevoked,
  handleSubscriptionUpdated,
  releaseWebhookDeliveryById,
} from '../services/polar';
import { BillingError } from '../lib/billing-constants';
import { authMiddleware } from '../middleware/auth';
import { logger } from '../lib/logger';
import type { JWTPayload } from '../lib/jwt';

const billing = new Hono();

billing.post('/v1/billing/create-checkout', authMiddleware, zValidator('json', z.object({
  plan: z.enum(['pro-monthly']),
})), async (c) => {
  const user = c.get('user') as JWTPayload;

  try {
    const session = await createCheckoutSession(user.sub);
    return c.json({ checkout_url: session.checkout_url });
  } catch (err: any) {
    if (err.message === BillingError.ALREADY_PRO) {
      return c.json({ error: 'already_pro' }, 409);
    }
    logger.error('Checkout creation failed', err);
    return c.json({ error: 'checkout_failed' }, 500);
  }
});

const toError = (error: unknown): Error => {
  if (error instanceof Error) {
    return error;
  }
  return new Error(typeof error === 'string' ? error : 'Unknown error');
};

const subscriptionEventTypes = new Set([
  'subscription.created',
  'subscription.active',
  'subscription.updated',
  'subscription.uncanceled',
  'subscription.canceled',
  'subscription.revoked',
]);

function getSubscriptionId(data: Record<string, unknown>): string | null {
  const id = data.id;
  if (typeof id === 'string' && id.length > 0) {
    return id;
  }

  const subscriptionId = data.subscription_id;
  if (typeof subscriptionId === 'string' && subscriptionId.length > 0) {
    return subscriptionId;
  }

  return null;
}

billing.post('/v1/billing/polar/webhook', async (c) => {
  const webhookId = c.req.header('webhook-id');
  if (!webhookId) {
    return c.json({ error: 'missing_webhook_id' }, 400);
  }

  const rawBody = await c.req.text();
  const headers: Record<string, string> = {
    'webhook-id': webhookId,
    'webhook-timestamp': c.req.header('webhook-timestamp') ?? '',
    'webhook-signature': c.req.header('webhook-signature') ?? '',
  };

  let event: ReturnType<typeof validateEvent>;
  try {
    event = validateEvent(rawBody, headers, process.env.POLAR_WEBHOOK_SECRET!);
  } catch (error) {
    if (error instanceof WebhookVerificationError) {
      return c.json({ received: false }, 403);
    }

    logger.error('billing_webhook_validation_failed', toError(error));
    return c.json({ received: false }, 500);
  }

  if (!subscriptionEventTypes.has(event.type)) {
    return c.json({ received: true });
  }

  const data = event.data as Record<string, unknown>;
  const claim = await claimWebhookDeliveryById({
    webhookId,
    eventType: event.type,
    subscriptionId: getSubscriptionId(data),
  });

  if (claim.isDuplicate) {
    logger.info('billing_webhook_duplicate', {
      event_type: event.type,
      webhook_id: webhookId,
    });
    return c.json({ received: true });
  }

  try {
    switch (event.type) {
      case 'subscription.created':
        if (data.status === 'active') {
          await handleSubscriptionActive(data);
        }
        break;
      case 'subscription.active':
        await handleSubscriptionActive(data);
        break;
      case 'subscription.updated':
        await handleSubscriptionUpdated(data);
        break;
      case 'subscription.uncanceled':
        await handleSubscriptionUncanceled(data);
        break;
      case 'subscription.canceled':
        await handleSubscriptionCanceled(data);
        break;
      case 'subscription.revoked':
        await handleSubscriptionRevoked(data);
        break;
    }
  } catch (error) {
    await releaseWebhookDeliveryById(webhookId);
    logger.error('billing_webhook_processing_failed', toError(error), {
      event_type: event.type,
      webhook_id: webhookId,
    });
    return c.json({ received: false }, 500);
  }

  return c.json({ received: true });
});

const resultPage = (title: string, color: string, heading: string, message: string) => `
<!DOCTYPE html>
<html>
<head>
  <title>${title}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f9fafb}
    .card{background:white;padding:2rem;border-radius:12px;box-shadow:0 4px 6px -1px rgb(0 0 0/.1);text-align:center;max-width:400px}
    h1{color:${color};margin-bottom:.5rem}
    p{color:#4b5563;line-height:1.5}
  </style>
</head>
<body>
  <div class="card">
    <h1>${heading}</h1>
    <p>${message}</p>
  </div>
</body>
</html>`;

billing.get('/billing/success', (c) => c.html(resultPage(
  'Payment Successful',
  '#059669',
  'Payment Successful!',
  'Thank you for subscribing to Unslop Pro. You can close this window.'
)));

billing.get('/billing/cancel', (c) => c.html(resultPage(
  'Payment Cancelled',
  '#dc2626',
  'Payment Cancelled',
  'No charges were made. You can close this window.'
)));

export { billing };
