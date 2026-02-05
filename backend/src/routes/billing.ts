import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { validateEvent, WebhookVerificationError } from '@polar-sh/sdk/webhooks';
import type { MiddlewareHandler } from 'hono';
import { BillingError } from '../lib/billing-constants';
import { CHECKOUT_PLAN_VALUES, POLAR_SUBSCRIPTION_EVENT_TYPES } from '../lib/domain-constants';
import type { PolarService } from '../services/polar';
import { getSubscriptionIdFromWebhookData } from '../services/polar-webhook-schema';

interface LoggerLike {
  info: (message: string, meta?: Record<string, unknown>) => void;
  error: (message: string, error: unknown, meta?: Record<string, unknown>) => void;
}

export interface BillingRoutesDeps {
  authMiddleware: MiddlewareHandler;
  polarService: PolarService;
  logger: LoggerLike;
  polarWebhookSecret: string;
}

const subscriptionEventTypes = new Set(POLAR_SUBSCRIPTION_EVENT_TYPES);

function toError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }
  return new Error(typeof error === 'string' ? error : 'Unknown error');
}

export function createBillingRoutes(deps: BillingRoutesDeps): Hono {
  const billing = new Hono();

  billing.post(
    '/v1/billing/create-checkout',
    deps.authMiddleware,
    zValidator('json', z.object({ plan: z.enum(CHECKOUT_PLAN_VALUES) })),
    async (c) => {
      const user = c.get('user');

      try {
        const session = await deps.polarService.createCheckoutSession(user.sub);
        return c.json({ checkout_url: session.checkout_url });
      } catch (error) {
        const err = toError(error);
        if (err.message === BillingError.ALREADY_PRO) {
          return c.json({ error: 'already_pro' }, 409);
        }
        deps.logger.error('checkout_creation_failed', err);
        return c.json({ error: 'checkout_failed' }, 500);
      }
    },
  );

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
      event = validateEvent(rawBody, headers, deps.polarWebhookSecret);
    } catch (error) {
      if (error instanceof WebhookVerificationError) {
        return c.json({ received: false }, 403);
      }

      deps.logger.error('billing_webhook_validation_failed', toError(error));
      return c.json({ received: false }, 500);
    }

    if (!subscriptionEventTypes.has(event.type as (typeof POLAR_SUBSCRIPTION_EVENT_TYPES)[number])) {
      return c.json({ received: true });
    }

    const claim = await deps.polarService.claimWebhookDeliveryById({
      webhookId,
      eventType: event.type,
      subscriptionId: getSubscriptionIdFromWebhookData(event.data),
    });

    if (claim.isDuplicate) {
      deps.logger.info('billing_webhook_duplicate', {
        event_type: event.type,
        webhook_id: webhookId,
      });
      return c.json({ received: true });
    }

    try {
      switch (event.type) {
        case 'subscription.created':
          if (typeof event.data === 'object' && event.data !== null && 'status' in event.data) {
            if ((event.data as { status?: unknown }).status === 'active') {
              await deps.polarService.handleSubscriptionActive(event.data);
            }
          }
          break;
        case 'subscription.active':
          await deps.polarService.handleSubscriptionActive(event.data);
          break;
        case 'subscription.updated':
          await deps.polarService.handleSubscriptionUpdated(event.data);
          break;
        case 'subscription.uncanceled':
          await deps.polarService.handleSubscriptionUncanceled(event.data);
          break;
        case 'subscription.canceled':
          await deps.polarService.handleSubscriptionCanceled(event.data);
          break;
        case 'subscription.revoked':
          await deps.polarService.handleSubscriptionRevoked(event.data);
          break;
      }
    } catch (error) {
      await deps.polarService.releaseWebhookDeliveryById(webhookId);
      deps.logger.error('billing_webhook_processing_failed', toError(error), {
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

  billing.get(
    '/billing/success',
    (c) =>
      c.html(
        resultPage(
          'Payment Successful',
          '#059669',
          'Payment Successful!',
          'Thank you for subscribing to Unslop Pro. You can close this window.',
        ),
      ),
  );

  billing.get(
    '/billing/cancel',
    (c) =>
      c.html(
        resultPage(
          'Payment Cancelled',
          '#dc2626',
          'Payment Cancelled',
          'No charges were made. You can close this window.',
        ),
      ),
  );

  return billing;
}
