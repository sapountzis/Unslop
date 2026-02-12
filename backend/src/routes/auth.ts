import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { MiddlewareHandler } from 'hono';
import type { AuthService } from '../services/auth-service';
import type { StatsService } from '../services/stats-service';
import type { AppLogger } from '../lib/logger-types';

export interface AuthRoutesDeps {
  authMiddleware: MiddlewareHandler;
  authService: AuthService;
  statsService: StatsService;
  logger: Pick<AppLogger, 'error'>;
}

const startAuthSchema = z.object({
  email: z.string().email(),
});

export function createAuthRoutes(deps: AuthRoutesDeps): Hono {
  const auth = new Hono();

  auth.post('/v1/auth/start', zValidator('json', startAuthSchema), async (c) => {
    try {
      const { email } = c.req.valid('json');
      await deps.authService.startAuth(email);
      return c.json({ status: 'accepted' }, 202);
    } catch (error) {
      deps.logger.error('auth_start_failed', error);
      return c.json({ error: 'internal_error' }, 500);
    }
  });

  auth.get('/v1/auth/callback', async (c) => {
    const token = c.req.query('token');

    if (!token) {
      return c.html(
        `<html>
          <body><h1>Invalid callback</h1><p>No token provided.</p></body>
        </html>`,
        400,
      );
    }

    try {
      const { sessionToken } = await deps.authService.completeMagicLink(token);

      return c.html(
        `<!DOCTYPE html>
        <html>
          <head>
            <title>Sign In - Unslop</title>
            <meta name="unslop-jwt" content="${sessionToken}">
          </head>
          <body>
            <h1>Sign in successful</h1>
            <p>You can close this tab and return to the extension.</p>
          </body>
        </html>`,
        200,
        {
          'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
          Pragma: 'no-cache',
          Expires: '0',
        },
      );
    } catch {
      return c.html(
        `<html>
          <body><h1>Invalid or expired link</h1><p>Please try again.</p></body>
        </html>`,
        400,
      );
    }
  });

  auth.get('/v1/me', deps.authMiddleware, async (c) => {
    const user = c.get('user');

    // Fetch user data and usage in parallel
    const [userData, usageData] = await Promise.all([
      deps.authService.getCurrentUser(user.sub),
      // Usage fetch may fail if user/quota context not found - fail open
      deps.statsService.getUsage(user.sub).catch(() => ({ found: false as const })),
    ]);

    if (!userData) {
      return c.json({ error: 'User not found' }, 404);
    }

    return c.json({
      user_id: userData.id,
      email: userData.email,
      plan: userData.plan,
      plan_status: userData.planStatus,
      // Include usage data if available
      ...(usageData.found ? {
        current_usage: usageData.current_usage,
        limit: usageData.limit,
        remaining: usageData.remaining,
        reset_date: usageData.reset_date,
      } : {}),
    });
  });

  return auth;
}
