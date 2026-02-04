// Billing routes for checkout and webhooks
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { Webhooks } from '@polar-sh/hono';
import { createCheckoutSession, handleSubscriptionActive, handleSubscriptionCancelled, handleSubscriptionUncensored } from '../services/polar';
import type { JWTPayload } from '../lib/jwt';
import { logger } from '../lib/logger';

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
      try {
        const data = payload.data as any;
        await handleSubscriptionActive(data);
        logger.info('Subscription created', {
          user_id: data.metadata?.user_id,
          subscription_id: data.subscription_id,
        });
      } catch (err) {
        logger.error('Failed to handle subscription.created', err as Error, {
          payload_type: 'subscription.created',
        });
        // Don't rethrow - return 200 to stop Polar retrying
      }
    },
    onSubscriptionActive: async (payload) => {
      try {
        const data = payload.data as any;
        await handleSubscriptionActive(data);
        logger.info('Subscription active', {
          user_id: data.metadata?.user_id,
          subscription_id: data.subscription_id,
        });
      } catch (err) {
        logger.error('Failed to handle subscription.active', err as Error, {
          payload_type: 'subscription.active',
        });
      }
    },
    onSubscriptionUpdated: async (payload) => {
      try {
        const data = payload.data as any;
        const status = data.status;
        if (status === 'active') {
          await handleSubscriptionActive(data);
          logger.info('Subscription updated to active', {
            user_id: data.metadata?.user_id,
            subscription_id: data.subscription_id,
          });
        } else if (status === 'canceled') {
          await handleSubscriptionCancelled(data);
          logger.info('Subscription updated to canceled', {
            user_id: data.metadata?.user_id,
            subscription_id: data.subscription_id,
          });
        } else if (status === 'uncanceled') {
          await handleSubscriptionUncensored(data);
          logger.info('Subscription updated to uncanceled', {
            user_id: data.metadata?.user_id,
            subscription_id: data.subscription_id,
          });
        }
      } catch (err) {
        const data = payload.data as any;
        logger.error('Failed to handle subscription.updated', err as Error, {
          payload_type: 'subscription.updated',
          status: data.status,
        });
      }
    },
    onSubscriptionCanceled: async (payload) => {
      try {
        const data = payload.data as any;
        await handleSubscriptionCancelled(data);
        logger.info('Subscription canceled', {
          user_id: data.metadata?.user_id,
          subscription_id: data.subscription_id,
        });
      } catch (err) {
        logger.error('Failed to handle subscription.canceled', err as Error, {
          payload_type: 'subscription.canceled',
        });
      }
    },
    onSubscriptionRevoked: async (payload) => {
      try {
        const data = payload.data as any;
        await handleSubscriptionCancelled(data);
        logger.info('Subscription revoked', {
          user_id: data.metadata?.user_id,
          subscription_id: data.subscription_id,
        });
      } catch (err) {
        logger.error('Failed to handle subscription.revoked', err as Error, {
          payload_type: 'subscription.revoked',
        });
      }
    },
    onPayload: async (payload) => {
      logger.info('Received unhandled webhook', {
        type: payload.type,
      });
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
