import { Hono } from 'hono';

export function createTestApp(registerRoutes: (app: Hono) => void): Hono {
  const app = new Hono();
  registerRoutes(app);
  return app;
}
