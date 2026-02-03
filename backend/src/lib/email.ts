// Email utility for sending magic link emails via Resend
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY!);

const MAGIC_LINK_BASE_URL = process.env.MAGIC_LINK_BASE_URL!;

if (!MAGIC_LINK_BASE_URL) {
  throw new Error('MAGIC_LINK_BASE_URL environment variable is required');
}

export async function sendMagicLinkEmail(email: string, token: string): Promise<void> {
  const link = `${MAGIC_LINK_BASE_URL}?token=${encodeURIComponent(token)}`;

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
