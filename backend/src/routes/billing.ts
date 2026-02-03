// Billing routes for checkout and webhooks
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { createCheckoutSession, handleSubscriptionWebhook, verifyWebhookSignature } from '../services/polar';
import type { JWTPayload } from '../lib/jwt';

const billing = new Hono();

const checkoutSchema = z.object({
  plan: z.enum(['pro-monthly']),
});

// Auth middleware (inline)
const authMiddleware = async (c: any, next: any) => {
  const authHeader = c.req.header('Authorization');

  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const token = authHeader.substring(7);

  try {
    const { verifySessionToken } = await import('../lib/jwt');
    const payload: JWTPayload = await verifySessionToken(token);
    c.set('user', payload);
    await next();
  } catch (err) {
    return c.json({ error: 'Invalid token' }, 401);
  }
};

// POST /v1/billing/create-checkout
billing.post('/v1/billing/create-checkout', authMiddleware, zValidator('json', checkoutSchema), async (c) => {
  const user = c.get('user') as JWTPayload;

  try {
    const session = await createCheckoutSession(user.sub);
    return c.json({ checkout_url: session.checkout_url });
  } catch (err: any) {
    if (err.message === 'ALREADY_PRO') {
      return c.json({ error: 'already_pro' }, 409);
    }
    console.error('Checkout creation failed:', err);
    return c.json({ error: 'checkout_failed' }, 500);
  }
});

// POST /v1/billing/polar/webhook
billing.post('/v1/billing/polar/webhook', async (c) => {
  // Get raw body for signature verification
  const rawBody = await c.req.text();
  const signature = c.req.header('x-polar-signature') || '';

  // Verify signature
  const isValid = await verifyWebhookSignature(rawBody, signature);

  if (!isValid) {
    return c.json({ error: 'invalid_signature' }, 401);
  }

  try {
    const payload = JSON.parse(rawBody);
    await handleSubscriptionWebhook(payload);
    return c.json({ received: true });
  } catch (err) {
    console.error('Webhook handling failed:', err);
    // Still return 200 so Polar doesn't retry
    return c.json({ received: true, error: 'processing_failed' });
  }
});

export { billing };
