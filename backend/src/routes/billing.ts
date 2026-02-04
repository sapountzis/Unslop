// Billing routes
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { Webhooks } from '@polar-sh/hono';
import {
  createCheckoutSession,
  handleSubscriptionActive,
  handleSubscriptionCanceled,
  handleSubscriptionUncanceled,
  handleSubscriptionRevoked,
  handleSubscriptionUpdated,
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

const wrapHandler = (handler: (data: Record<string, unknown>) => Promise<void>, eventType: string) => {
  return async (payload: { data: unknown }) => {
    try {
      await handler(payload.data as Record<string, unknown>);
    } catch (err) {
      logger.error(`Failed to handle ${eventType}`, err as Error);
    }
  };
};

billing.post(
  '/v1/billing/polar/webhook',
  Webhooks({
    webhookSecret: process.env.POLAR_WEBHOOK_SECRET!,
    onSubscriptionCreated: wrapHandler(async (data) => {
      if (data.status === 'active') await handleSubscriptionActive(data);
    }, 'subscription.created'),
    onSubscriptionActive: wrapHandler(handleSubscriptionActive, 'subscription.active'),
    onSubscriptionUpdated: wrapHandler(handleSubscriptionUpdated, 'subscription.updated'),
    onSubscriptionUncanceled: wrapHandler(handleSubscriptionUncanceled, 'subscription.uncanceled'),
    onSubscriptionCanceled: wrapHandler(handleSubscriptionCanceled, 'subscription.canceled'),
    onSubscriptionRevoked: wrapHandler(handleSubscriptionRevoked, 'subscription.revoked'),
  })
);

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
