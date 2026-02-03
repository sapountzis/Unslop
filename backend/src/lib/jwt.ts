// JWT utilities for session management
import { sign, verify } from 'hono/jwt';

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is required');
  }
  return secret;
}

export interface JWTPayload {
  sub: string; // user_id
  email: string;
  iat: number;
  exp: number;
}

type HonoJWTPayload = {
  [key: string]: any;
};

// Generate a session token (valid for 60 days by default)
export async function generateSessionToken(userId: string, email: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + 60 * 60 * 24 * 60; // 60 days

  return await sign(
    {
      sub: userId,
      email,
      iat: now,
      exp,
    },
    getJwtSecret(),
    'HS256'
  );
}

// Verify a session token
export async function verifySessionToken(token: string): Promise<JWTPayload> {
  const payload = await verify(token, getJwtSecret(), 'HS256') as HonoJWTPayload;
  return {
    sub: payload.sub as string,
    email: payload.email as string,
    iat: payload.iat as number,
    exp: payload.exp as number,
  };
}

// Generate a magic link token (valid for 15 minutes)
export async function generateMagicLinkToken(userId: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + 60 * 15; // 15 minutes

  return await sign(
    {
      sub: userId,
      type: 'magic_link',
      iat: now,
      exp,
    },
    getJwtSecret(),
    'HS256'
  );
}

// Verify a magic link token
export async function verifyMagicLinkToken(token: string): Promise<{ userId: string }> {
  const payload = await verify(token, getJwtSecret(), 'HS256') as { sub: string; type?: string };

  if (payload.type !== 'magic_link') {
    throw new Error('Invalid token type');
  }

  return { userId: payload.sub };
}
