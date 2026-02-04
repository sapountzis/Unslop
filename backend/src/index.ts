// Main entry point for Unslop backend
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { classify } from './routes/classify';
import { billing } from './routes/billing';
import { auth } from './routes/auth';
import { feedback } from './routes/feedback';
import { stats } from './routes/stats';

const app = new Hono();

// Middleware
app.use('*', logger());
app.use('*', cors({
  origin: (origin) => {
    if (origin.startsWith('chrome-extension://') || origin === 'https://www.linkedin.com') {
      return origin;
    }
    return 'https://www.linkedin.com'; // Default fallback
  },
  allowHeaders: ['Content-Type', 'Authorization'],
  allowMethods: ['GET', 'POST', 'OPTIONS'],
}));

// Health check
app.get('/', (c) => c.json({ status: 'ok' }));

// Health check endpoint with details
app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '0.1.0',
  });
});

// Mount classify routes
app.route('/', classify);

// Mount billing routes
app.route('/', billing);

// Mount auth routes
app.route('/', auth);

// Mount feedback routes
app.route('/', feedback);

// Mount stats routes
app.route('/', stats);


// Start server
const port = parseInt(process.env.PORT || '3000');

console.log(`Server starting on port ${port}`);

export default {
  port,
  fetch: app.fetch,
};
