// Email utility for sending magic link emails via Resend
import { Resend } from 'resend';
import { runtime } from '../config/runtime';
import { logger } from './logger';

const RESEND_API_KEY = runtime.email.resendApiKey;
const MAGIC_LINK_BASE_URL = runtime.email.magicLinkBaseUrl;

if (!MAGIC_LINK_BASE_URL) {
  throw new Error('MAGIC_LINK_BASE_URL environment variable is required');
}

// Only initialize Resend if we have a real API key
const resend = RESEND_API_KEY && !RESEND_API_KEY.startsWith('re_dummy')
  ? new Resend(RESEND_API_KEY)
  : null;

export async function sendMagicLinkEmail(email: string, token: string): Promise<void> {
  const link = `${MAGIC_LINK_BASE_URL}?token=${encodeURIComponent(token)}`;

  // In development with dummy key, log the link instead of sending email
  if (!resend) {
    logger.info('auth_magic_link_dev_mode', {
      email,
      link: runtime.email.logMagicLinkUrls ? link : '[redacted]',
      note: runtime.email.logMagicLinkUrls
        ? 'Set LOG_MAGIC_LINK_URLS=false to redact magic links from logs.'
        : 'Set LOG_MAGIC_LINK_URLS=true to log local magic links for manual testing.',
    });
    return;
  }

  await resend.emails.send({
    from: 'Unslop <noreply@getunslop.com>',
    to: email,
    subject: 'Sign in to Unslop',
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: system-ui, -apple-system, sans-serif; line-height: 1.5; }
            a { color: #0066cc; }
            .button { display: inline-block; padding: 12px 24px; background: #0066cc; color: white; text-decoration: none; border-radius: 6px; }
          </style>
        </head>
        <body>
          <h2>Sign in to Unslop</h2>
          <p>Click the button below to sign in to your account:</p>
          <p><a href="${link}" class="button">Sign In</a></p>
          <p>Or copy this link:<br><a href="${link}">${link}</a></p>
          <p>This link expires in 15 minutes.</p>
        </body>
      </html>
    `,
  });
}
