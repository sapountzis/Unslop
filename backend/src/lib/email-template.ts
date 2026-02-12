export interface MagicLinkEmailContent {
  subject: string;
  text: string;
  html: string;
}

export interface BuildMagicLinkEmailContentInput {
  link: string;
  appName?: string;
  expiresInMinutes?: number;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function buildMagicLinkEmailContent(input: BuildMagicLinkEmailContentInput): MagicLinkEmailContent {
  const appName = input.appName ?? 'Unslop';
  const expiresInMinutes = input.expiresInMinutes ?? 15;
  const safeLink = escapeHtml(input.link);
  const subject = `Sign in to ${appName}`;

  const text = [
    `Sign in to ${appName}`,
    '',
    'You requested a secure sign-in link.',
    `Use this link within ${expiresInMinutes} minutes:`,
    input.link,
    '',
    "If you didn't request this, you can ignore this email.",
  ].join('\n');

  const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="margin:0;padding:0;background:#f4f6f8;color:#111827;font-family:Arial,sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">
      Your secure sign-in link for ${escapeHtml(appName)}.
    </div>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:560px;background:#ffffff;border-radius:10px;padding:28px;">
            <tr>
              <td style="font-size:24px;font-weight:700;padding-bottom:12px;">Sign in to ${escapeHtml(appName)}</td>
            </tr>
            <tr>
              <td style="font-size:16px;line-height:1.5;padding-bottom:20px;">
                You requested a secure sign-in link. Use it within ${expiresInMinutes} minutes.
              </td>
            </tr>
            <tr>
              <td style="padding-bottom:20px;">
                <a href="${safeLink}" style="display:inline-block;background:#0b57d0;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600;">Sign in</a>
              </td>
            </tr>
            <tr>
              <td style="font-size:14px;line-height:1.5;color:#374151;padding-bottom:12px;">
                If the button does not work, use this link:
              </td>
            </tr>
            <tr>
              <td style="font-size:14px;line-height:1.5;padding-bottom:20px;">
                <a href="${safeLink}" style="color:#0b57d0;">${safeLink}</a>
              </td>
            </tr>
            <tr>
              <td style="font-size:13px;line-height:1.5;color:#6b7280;">
                If you did not request this, you can ignore this email.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return {
    subject,
    text,
    html,
  };
}
