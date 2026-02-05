import type { MiddlewareHandler } from 'hono';
import { logger } from '../lib/logger';

export const requestLogger: MiddlewareHandler = async (c, next) => {
  const startedAt = Date.now();
  const path = c.req.path;

  try {
    await next();
  } finally {
    logger.info('http_request', {
      method: c.req.method,
      path,
      status: c.res.status,
      duration_ms: Date.now() - startedAt,
    });
  }
};
