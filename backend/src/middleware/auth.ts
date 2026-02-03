// JWT auth middleware for Hono
import { MiddlewareHandler } from 'hono';
import { verifySessionToken, type JWTPayload } from '../lib/jwt';

export const authMiddleware: MiddlewareHandler = async (c, next) => {
  const authHeader = c.req.header('Authorization');

  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const token = authHeader.substring(7);

  try {
    const payload = await verifySessionToken(token);
    c.set('user', payload);
    await next();
  } catch {
    return c.json({ error: 'Invalid token' }, 401);
  }
};

declare module 'hono' {
  interface ContextVariableMap {
    user: JWTPayload;
  }
}
