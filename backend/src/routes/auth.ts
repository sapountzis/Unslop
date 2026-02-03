// Auth routes: POST /v1/auth/start, GET /v1/auth/callback, GET /v1/me
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { db } from '../db';
import { users } from '../db/schema';
import { eq } from 'drizzle-orm';
import {
  generateMagicLinkToken,
  generateSessionToken,
  verifyMagicLinkToken,
} from '../lib/jwt';
import { sendMagicLinkEmail } from '../lib/email';
import { authMiddleware } from '../middleware/auth';

const auth = new Hono();

const startAuthSchema = z.object({
  email: z.string().email(),
});

// POST /v1/auth/start
auth.post('/v1/auth/start', zValidator('json', startAuthSchema), async (c) => {
  const { email } = c.req.valid('json');

  // Normalize email
  const normalizedEmail = email.toLowerCase().trim();

  // Upsert user
  const existingUser = await db
    .select()
    .from(users)
    .where(eq(users.email, normalizedEmail))
    .limit(1);

  let userId: string;

  if (existingUser.length > 0) {
    userId = existingUser[0].id;
  } else {
    const newUser = await db
      .insert(users)
      .values({
        email: normalizedEmail,
        plan: 'free',
        planStatus: 'inactive',
      })
      .returning();

    userId = newUser[0].id;
  }

  // Generate magic link token
  const token = await generateMagicLinkToken(userId);

  // Send email
  await sendMagicLinkEmail(normalizedEmail, token);

  return c.json({ status: 'accepted' }, 202);
});

// GET /v1/auth/callback
auth.get('/v1/auth/callback', async (c) => {
  const token = c.req.query('token');

  if (!token) {
    return c.html(
      `<html>
        <body><h1>Invalid callback</h1><p>No token provided.</p></body>
      </html>`,
      400
    );
  }

  try {
    const { userId } = await verifyMagicLinkToken(token);

    // Get user email
    const userRecords = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (userRecords.length === 0) {
      throw new Error('User not found');
    }

    const user = userRecords[0];

    // Generate session JWT
    const sessionToken = await generateSessionToken(user.id, user.email);

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
          <script>
            // Send token to extension via postMessage (for content script)
            if (window.opener) {
              window.opener.postMessage({ type: 'UNSLOP_AUTH_SUCCESS', token: '${sessionToken}' }, '*');
            }
          </script>
        </body>
      </html>`
    );
  } catch {
    return c.html(
      `<html>
        <body><h1>Invalid or expired link</h1><p>Please try again.</p></body>
      </html>`,
      400
    );
  }
});

// GET /v1/me
auth.get('/v1/me', authMiddleware, async (c) => {
  const user = c.get('user');

  // Get fresh user data from DB
  const userRecords = await db
    .select()
    .from(users)
    .where(eq(users.id, user.sub))
    .limit(1);

  if (userRecords.length === 0) {
    return c.json({ error: 'User not found' }, 404);
  }

  const userData = userRecords[0];

  return c.json({
    user_id: userData.id,
    email: userData.email,
    plan: userData.plan,
    plan_status: userData.planStatus,
  });
});

export { auth };
