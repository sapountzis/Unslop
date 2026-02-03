// Email utility for sending magic link emails via Resend
import { Resend } from 'resend';

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const MAGIC_LINK_BASE_URL = process.env.MAGIC_LINK_BASE_URL!;

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
    console.log('\n========================================');
    console.log('📧 MAGIC LINK (dev mode - email not sent)');
    console.log(`   To: ${email}`);
    console.log(`   Link: ${link}`);
    console.log('========================================\n');
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
