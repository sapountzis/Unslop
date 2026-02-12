import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { validateEvent, WebhookVerificationError } from '@polar-sh/sdk/webhooks';
import type { MiddlewareHandler } from 'hono';
import { BillingError } from '../lib/billing-constants';
import { CHECKOUT_PLAN_VALUES, POLAR_SUBSCRIPTION_EVENT_TYPES } from '../lib/domain-constants';
import type { PolarService } from '../services/polar';
import { getSubscriptionIdFromWebhookData } from '../services/polar-webhook-schema';
import type { AppLogger } from '../lib/logger-types';

export interface BillingRoutesDeps {
  authMiddleware: MiddlewareHandler;
  polarService: PolarService;
  logger: Pick<AppLogger, 'info' | 'error'>;
  polarWebhookSecret: string;
}

type SubscriptionEventType = (typeof POLAR_SUBSCRIPTION_EVENT_TYPES)[number];

const subscriptionEventTypes = new Set<SubscriptionEventType>(POLAR_SUBSCRIPTION_EVENT_TYPES);

function toError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }
  return new Error(typeof error === 'string' ? error : 'Unknown error');
}

function isSubscriptionEventType(eventType: string): eventType is SubscriptionEventType {
  return subscriptionEventTypes.has(eventType as SubscriptionEventType);
}

function parseWebhookEventFromRawBody(rawBody: string): { type: string; data: unknown } | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return null;
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return null;
  }

  const event = parsed as Record<string, unknown>;
  if (typeof event.type !== 'string') {
    return null;
  }

  return {
    type: event.type,
    data: event.data,
  };
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

    let eventType: string;
    let eventData: unknown;
    try {
      const event = validateEvent(rawBody, headers, deps.polarWebhookSecret);
      eventType = event.type;
      eventData = event.data;
    } catch (error) {
      if (error instanceof WebhookVerificationError) {
        return c.json({ received: false }, 403);
      }

      // SDK versions before explicit past_due parsing can still verify signatures but reject event parsing.
      const fallbackEvent = parseWebhookEventFromRawBody(rawBody);
      if (fallbackEvent?.type === 'subscription.past_due') {
        eventType = fallbackEvent.type;
        eventData = fallbackEvent.data;
        deps.logger.info('billing_webhook_sdk_parse_fallback_used', {
          event_type: eventType,
          webhook_id: webhookId,
        });
      } else {
        deps.logger.error('billing_webhook_validation_failed', toError(error));
        return c.json({ received: false }, 500);
      }
    }

    if (!isSubscriptionEventType(eventType)) {
      return c.json({ received: true });
    }

    const claim = await deps.polarService.claimWebhookDeliveryById({
      webhookId,
      eventType,
      subscriptionId: getSubscriptionIdFromWebhookData(eventData),
    });

    if (claim.isDuplicate) {
      deps.logger.info('billing_webhook_duplicate', {
        event_type: eventType,
        webhook_id: webhookId,
      });
      return c.json({ received: true });
    }

    try {
      switch (eventType) {
        case 'subscription.created':
          if (typeof eventData === 'object' && eventData !== null && 'status' in eventData) {
            if ((eventData as { status?: unknown }).status === 'active') {
              await deps.polarService.handleSubscriptionActive(eventData);
            }
          }
          break;
        case 'subscription.active':
          await deps.polarService.handleSubscriptionActive(eventData);
          break;
        case 'subscription.updated':
          await deps.polarService.handleSubscriptionUpdated(eventData);
          break;
        case 'subscription.uncanceled':
          await deps.polarService.handleSubscriptionUncanceled(eventData);
          break;
        case 'subscription.canceled':
          await deps.polarService.handleSubscriptionCanceled(eventData);
          break;
        case 'subscription.revoked':
          await deps.polarService.handleSubscriptionRevoked(eventData);
          break;
        case 'subscription.past_due':
          await deps.polarService.handleSubscriptionPastDue(eventData);
          break;
      }
    } catch (error) {
      await deps.polarService.releaseWebhookDeliveryById(webhookId);
      deps.logger.error('billing_webhook_processing_failed', toError(error), {
        event_type: eventType,
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
