import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { createAuthRoutes } from '../routes/auth';
import { createBillingRoutes } from '../routes/billing';
import { createClassifyRoutes } from '../routes/classify';
import { createFeedbackRoutes } from '../routes/feedback';
import { createStatsRoutes } from '../routes/stats';
import { createRequestLogger } from '../middleware/request-logger';
import type { AppDependencies } from './dependencies';

export function createApp(deps: AppDependencies): Hono {
  const app = new Hono();

  app.use('*', createRequestLogger({ logger: deps.logger }));
  app.use(
    '*',
    cors({
      origin: (origin) => {
        if (origin.startsWith('chrome-extension://') || origin === 'https://www.linkedin.com') {
          return origin;
        }
        return 'https://www.linkedin.com';
      },
      allowHeaders: ['Content-Type', 'Authorization'],
      allowMethods: ['GET', 'POST', 'OPTIONS'],
    }),
  );

  app.onError((error, c) => {
    deps.logger.error('unhandled_request_error', error, {
      method: c.req.method,
      path: c.req.path,
    });
    return c.json({ error: 'internal_error' }, 500);
  });

  app.get('/', (c) => c.json({ status: 'ok' }));

  app.get('/health', (c) =>
    c.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: '0.1.0',
    }),
  );

  app.route(
    '/',
    createClassifyRoutes({
      authMiddleware: deps.authMiddleware,
      classificationService: deps.services.classification,
    }),
  );

  app.route(
    '/',
    createBillingRoutes({
      authMiddleware: deps.authMiddleware,
      polarService: deps.services.polar,
      logger: deps.logger,
      polarWebhookSecret: deps.config.billing.polarWebhookSecret,
    }),
  );

  app.route(
    '/',
    createAuthRoutes({
      authMiddleware: deps.authMiddleware,
      authService: deps.services.auth,
      logger: deps.logger,
    }),
  );

  app.route(
    '/',
    createFeedbackRoutes({
      authMiddleware: deps.authMiddleware,
      feedbackService: deps.services.feedback,
    }),
  );

  app.route(
    '/',
    createStatsRoutes({
      authMiddleware: deps.authMiddleware,
      statsService: deps.services.stats,
    }),
  );

  return app;
}
