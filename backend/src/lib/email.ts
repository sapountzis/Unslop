// Email utility for sending magic link emails via Resend
import { Resend } from 'resend';
import { runtime } from '../config/runtime';
import { logger } from './logger';
import { buildMagicLinkEmailContent } from './email-template';

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
  const linkUrl = new URL(MAGIC_LINK_BASE_URL);
  linkUrl.searchParams.set('token', token);
  const link = linkUrl.toString();
  const content = buildMagicLinkEmailContent({
    link,
    appName: 'Unslop',
    expiresInMinutes: 15,
  });

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

  const response = await resend.emails.send({
    from: 'Unslop <noreply@getunslop.com>',
    to: email,
    subject: content.subject,
    text: content.text,
    html: content.html,
  });

  if (response.error) {
    logger.error(
      'auth_magic_link_send_failed',
      new Error(response.error.message),
      {
        provider: 'resend',
        code: response.error.name,
        statusCode: response.error.statusCode,
      },
    );
    throw new Error('email_send_failed');
  }

  logger.info('auth_magic_link_sent', {
    provider: 'resend',
    id: response.data?.id ?? null,
  });
}
