// Billing routes for checkout and webhooks
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { Webhooks } from '@polar-sh/hono';
import { createCheckoutSession, handleSubscriptionActive, handleSubscriptionCancelled, handleSubscriptionUncensored } from '../services/polar';
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
billing.post(
  '/v1/billing/polar/webhook',
  Webhooks({
    webhookSecret: process.env.POLAR_WEBHOOK_SECRET!,
    onSubscriptionCreated: async (payload) => {
      await handleSubscriptionActive(payload.data as any);
    },
    onSubscriptionActive: async (payload) => {
      await handleSubscriptionActive(payload.data as any);
    },
    onSubscriptionUpdated: async (payload) => {
      const data = payload.data as any;
      const status = data.status;

      if (status === 'active') {
        await handleSubscriptionActive(data);
        console.log('Subscription updated to active', {
          user_id: data.metadata?.user_id,
          subscription_id: data.subscription_id,
        });
      } else if (status === 'canceled') {
        await handleSubscriptionCancelled(data);
        console.log('Subscription updated to canceled', {
          user_id: data.metadata?.user_id,
          subscription_id: data.subscription_id,
        });
      } else if (status === 'uncensored') {
        await handleSubscriptionUncensored(data);
        console.log('Subscription updated to uncensored', {
          user_id: data.metadata?.user_id,
          subscription_id: data.subscription_id,
        });
      } else {
        console.log('Subscription updated with unknown status', { status });
      }
    },
    onSubscriptionCanceled: async (payload) => {
      await handleSubscriptionCancelled(payload.data as any);
    },
    onSubscriptionRevoked: async (payload) => {
      await handleSubscriptionCancelled(payload.data as any);
    },
    onPayload: async (payload) => {
      // Catch-all mostly for logging, or silence it.
      // console.log('Received other webhook:', payload.type);
    }
  })
);


// GET /billing/success
billing.get('/billing/success', (c) => {
  return c.html(`
    <html>
      <head>
        <title>Payment Successful</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body { font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f9fafb; }
          .card { background: white; padding: 2rem; border-radius: 12px; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); text-align: center; max-width: 400px; }
          h1 { color: #059669; margin-bottom: 0.5rem; }
          p { color: #4b5563; line-height: 1.5; }
          .button { display: inline-block; margin-top: 1.5rem; padding: 0.75rem 1.5rem; background: #000; color: white; text-decoration: none; border-radius: 6px; font-weight: 500; }
        </style>
      </head>
      <body>
        <div class="card">
          <h1>Payment Successful!</h1>
          <p>Thank you for subscribing to Unslop Pro. Your account has been upgraded.</p>
          <p>You can now close this window and return to LinkedIn.</p>
        </div>
      </body>
    </html>
  `);
});

// GET /billing/cancel
billing.get('/billing/cancel', (c) => {
  return c.html(`
    <html>
      <head>
        <title>Payment Cancelled</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body { font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f9fafb; }
          .card { background: white; padding: 2rem; border-radius: 12px; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); text-align: center; max-width: 400px; }
          h1 { color: #dc2626; margin-bottom: 0.5rem; }
          p { color: #4b5563; line-height: 1.5; }
        </style>
      </head>
      <body>
        <div class="card">
          <h1>Payment Cancelled</h1>
          <p>No charges were made. You can try again whenever you're ready.</p>
          <p>You can close this window.</p>
        </div>
      </body>
    </html>
  `);
});

export { billing };
