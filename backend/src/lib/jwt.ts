// JWT utilities for session management
import { sign, verify } from 'hono/jwt';
import { loadRuntimeConfig } from '../config/runtime';
import { MAGIC_LINK_TOKEN_TTL_SECONDS, SESSION_TOKEN_TTL_SECONDS } from './policy-constants';

export interface JWTPayload {
  sub: string;
  email: string;
  iat: number;
  exp: number;
}

interface MagicLinkTokenPayload {
  sub: string;
  type: 'magic_link';
  iat: number;
  exp: number;
}

function getJwtSecret(): string {
  const runtime = loadRuntimeConfig();
  if (!runtime.auth.jwtSecret) {
    throw new Error('JWT_SECRET environment variable is required');
  }
  return runtime.auth.jwtSecret;
}

function asObjectPayload(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid JWT payload');
  }
  return payload as Record<string, unknown>;
}

function asString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Invalid JWT payload field: ${field}`);
  }
  return value;
}

function asNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Invalid JWT payload field: ${field}`);
  }
  return value;
}

export async function generateSessionToken(userId: string, email: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + SESSION_TOKEN_TTL_SECONDS;

  return sign(
    {
      sub: userId,
      email,
      iat: now,
      exp,
    },
    getJwtSecret(),
    'HS256',
  );
}

export async function verifySessionToken(token: string): Promise<JWTPayload> {
  const payload = asObjectPayload(await verify(token, getJwtSecret(), 'HS256'));
  return {
    sub: asString(payload.sub, 'sub'),
    email: asString(payload.email, 'email'),
    iat: asNumber(payload.iat, 'iat'),
    exp: asNumber(payload.exp, 'exp'),
  };
}

export async function generateMagicLinkToken(userId: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + MAGIC_LINK_TOKEN_TTL_SECONDS;

  return sign(
    {
      sub: userId,
      type: 'magic_link',
      iat: now,
      exp,
    } satisfies MagicLinkTokenPayload,
    getJwtSecret(),
    'HS256',
  );
}

export async function verifyMagicLinkToken(token: string): Promise<{ userId: string }> {
  const payload = asObjectPayload(await verify(token, getJwtSecret(), 'HS256'));

  if (payload.type !== 'magic_link') {
    throw new Error('Invalid token type');
  }

  return { userId: asString(payload.sub, 'sub') };
}
