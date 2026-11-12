/**
 * brevo.ts
 * MingleBooth Transactional Email Client via Brevo REST API v3
 *
 * Strictly server-side: Never exposed to the browser.
 * Endpoint: POST https://api.brevo.com/v3/smtp/email
 */

export interface SendWelcomeEmailParams {
  toEmail: string;
  studioName: string;
  appBaseUrl?: string;
}

export interface BrevoEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
  skipped?: boolean;
}

/**
 * Escapes unsafe HTML characters to prevent XSS / HTML injection in dynamic email contents.
 */
export function escapeHtml(str: string): string {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Renders the responsive HTML Welcome Email template for newly registered MingleBooth vendors.
 * Built with bulletproof table layout & inline styles compatible with Gmail, Apple Mail, and Outlook.
 */
export function renderWelcomeEmailHtml(params: {
  studioName: string;
  email: string;
  dashboardUrl: string;
}): string {
  const safeStudioName = escapeHtml(params.studioName.trim());
  const safeEmail = escapeHtml(params.email.trim());
  const safeDashboardUrl = escapeHtml(params.dashboardUrl.trim());

  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Selamat Datang di MingleBooth</title>
  <style>
    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { -ms-interpolation-mode: bicubic; border: 0; outline: none; text-decoration: none; }
    body { margin: 0; padding: 0; width: 100% !important; background-color: #0A0A0C; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #E4E4E7; }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #0A0A0C; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #E4E4E7;">
  <center style="width: 100%; background-color: #0A0A0C; padding: 32px 12px;">
    <!-- Container -->
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 580px; margin: 0 auto; background-color: #12141A; border: 1px solid #27272A; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.6);">
      
      <!-- Header with Logo -->
      <tr>
        <td style="padding: 36px 36px 24px 36px; text-align: left; border-bottom: 1px solid #1E2028; background: linear-gradient(180deg, #181B24 0%, #12141A 100%);">
          <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
            <tr>
              <td>
                <span style="font-size: 24px; font-weight: 800; letter-spacing: -0.5px; color: #FFFFFF; display: inline-block;">
                  Mingle<span style="color: #F59E0B;">Booth</span>
                </span>
                <span style="display: block; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 1.5px; color: #71717A; margin-top: 4px;">
                  Professional Photobooth Platform
                </span>
              </td>
            </tr>
          </table>
        </td>
      </tr>

      <!-- Main Body Content -->
      <tr>
        <td style="padding: 32px 36px; text-align: left;">
          
          <h1 style="margin: 0 0 16px 0; font-size: 22px; font-weight: 700; color: #FFFFFF; line-height: 1.3;">
            Halo, ${safeStudioName}! 👋
          </h1>
          
          <p style="margin: 0 0 20px 0; font-size: 15px; line-height: 1.6; color: #A1A1AA;">
            Selamat bergabung! Akun studio photobooth Anda telah berhasil dibuat dan siap digunakan. Anda kini dapat mulai menyiapkan acara, mengatur bingkai template, dan mengoperasikan photobooth langsung dari dashboard vendor Anda.
          </p>

          <!-- Account Details Box -->
          <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #171A22; border: 1px solid #262A36; border-radius: 12px; margin: 24px 0; padding: 18px 20px;">
            <tr>
              <td style="padding: 6px 0; font-size: 13px; color: #71717A; width: 130px; font-weight: 500;">Nama Studio:</td>
              <td style="padding: 6px 0; font-size: 14px; color: #FFFFFF; font-weight: 600;">${safeStudioName}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; font-size: 13px; color: #71717A; font-weight: 500;">Email Akun:</td>
              <td style="padding: 6px 0; font-size: 14px; color: #E4E4E7; font-weight: 500;">${safeEmail}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; font-size: 13px; color: #71717A; font-weight: 500;">Status Akun:</td>
              <td style="padding: 6px 0; font-size: 13px; color: #10B981; font-weight: 600;">
                <span style="display: inline-block; width: 8px; height: 8px; background-color: #10B981; border-radius: 50%; margin-right: 6px;"></span>Aktif &amp; Terverifikasi
              </td>
            </tr>
          </table>

          <!-- CTA Button -->
          <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin: 28px 0 32px 0;">
            <tr>
              <td align="center">
                <a href="${safeDashboardUrl}" target="_blank" style="display: inline-block; background-color: #FFFFFF; color: #0A0A0C; font-size: 15px; font-weight: 700; text-decoration: none; padding: 14px 36px; border-radius: 10px; box-shadow: 0 4px 14px rgba(255,255,255,0.15); transition: background-color 0.2s;">
                  Buka Dashboard Vendor &rarr;
                </a>
              </td>
            </tr>
          </table>

          <!-- Divider -->
          <div style="border-top: 1px solid #1E2028; margin: 28px 0;"></div>

          <!-- Quick Start Guide (3 Langkah Cepat) -->
          <h2 style="margin: 0 0 16px 0; font-size: 16px; font-weight: 700; color: #FFFFFF; text-transform: uppercase; letter-spacing: 0.8px;">
            ⚡ 3 Langkah Memulai Studio Anda:
          </h2>

          <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 12px;">
            <tr>
              <td valign="top" style="width: 32px; padding-top: 2px;">
                <span style="display: inline-block; width: 24px; height: 24px; background-color: rgba(245, 158, 11, 0.15); color: #F59E0B; border: 1px solid rgba(245, 158, 11, 0.3); border-radius: 6px; text-align: center; line-height: 22px; font-size: 12px; font-weight: 700;">1</span>
              </td>
              <td style="padding-left: 10px; padding-bottom: 16px;">
                <strong style="color: #FFFFFF; font-size: 14px; display: block; margin-bottom: 3px;">Unduh Software Operator MingleBooth</strong>
                <span style="font-size: 13px; color: #A1A1AA; line-height: 1.5;">Dapatkan aplikasi MingleBooth Studio untuk macOS atau Windows dari halaman dashboard Anda.</span>
              </td>
            </tr>
            <tr>
              <td valign="top" style="width: 32px; padding-top: 2px;">
                <span style="display: inline-block; width: 24px; height: 24px; background-color: rgba(245, 158, 11, 0.15); color: #F59E0B; border: 1px solid rgba(245, 158, 11, 0.3); border-radius: 6px; text-align: center; line-height: 22px; font-size: 12px; font-weight: 700;">2</span>
              </td>
              <td style="padding-left: 10px; padding-bottom: 16px;">
                <strong style="color: #FFFFFF; font-size: 14px; display: block; margin-bottom: 3px;">Sambungkan Kamera Studio</strong>
                <span style="font-size: 13px; color: #A1A1AA; line-height: 1.5;">Gunakan kamera Canon atau Sony mirrorless/DSLR melalui kabel USB atau integrasi Hot Folder otomatis.</span>
              </td>
            </tr>
            <tr>
              <td valign="top" style="width: 32px; padding-top: 2px;">
                <span style="display: inline-block; width: 24px; height: 24px; background-color: rgba(245, 158, 11, 0.15); color: #F59E0B; border: 1px solid rgba(245, 158, 11, 0.3); border-radius: 6px; text-align: center; line-height: 22px; font-size: 12px; font-weight: 700;">3</span>
              </td>
              <td style="padding-left: 10px; padding-bottom: 8px;">
                <strong style="color: #FFFFFF; font-size: 14px; display: block; margin-bottom: 3px;">Buat Acara &amp; Cetak / Bagikan QR</strong>
                <span style="font-size: 13px; color: #A1A1AA; line-height: 1.5;">Pilih template foto Anda, mulai sesi potret, lalu cetak instan atau bagikan QR galeri ke tamu acara.</span>
              </td>
            </tr>
          </table>

          <!-- Support Notice Box -->
          <div style="background-color: #171A22; border-left: 3px solid #F59E0B; padding: 14px 16px; border-radius: 6px; margin-top: 24px;">
            <p style="margin: 0; font-size: 13px; color: #D4D4D8; line-height: 1.5;">
              Butuh panduan teknis atau bantuan aktivasi hardware? Tim support MingleBooth siap membantu Anda kapan saja melalui <a href="mailto:hello@minglebooth.id" style="color: #F59E0B; text-decoration: none; font-weight: 600;">hello@minglebooth.id</a>.
            </p>
          </div>

        </td>
      </tr>

      <!-- Footer -->
      <tr>
        <td style="padding: 24px 36px 32px 36px; text-align: center; border-top: 1px solid #1E2028; background-color: #0E1015;">
          <p style="margin: 0 0 6px 0; font-size: 12px; color: #71717A;">
            &copy; 2026 MingleBooth. Seluruh hak cipta dilindungi.
          </p>
          <p style="margin: 0; font-size: 11px; color: #52525B;">
            Email ini dikirimkan secara otomatis kepada ${safeEmail} karena akun studio didaftarkan di platform MingleBooth.
          </p>
        </td>
      </tr>

    </table>
  </center>
</body>
</html>`;
}

/**
 * Dispatches a transactional Welcome Email to a newly registered vendor via Brevo v3 API.
 * Non-blocking guarantee: Registration must never fail if this dispatch encounters an error.
 */
export async function sendWelcomeEmail(
  params: SendWelcomeEmailParams
): Promise<BrevoEmailResult> {
  const { toEmail, studioName, appBaseUrl } = params;

  const apiKey = (process.env.BREVO_API_KEY || '').trim();
  const senderEmail = (process.env.BREVO_SENDER_EMAIL || 'hello@minglebooth.id').trim();
  const senderName = (process.env.BREVO_SENDER_NAME || 'MingleBooth').trim();

  if (!apiKey) {
    console.warn('[Brevo] BREVO_API_KEY is not configured in server environment. Skipping welcome email.');
    return { success: false, skipped: true, error: 'BREVO_API_KEY not configured' };
  }

  if (!toEmail || !toEmail.includes('@')) {
    console.error('[Brevo] Invalid recipient email address:', toEmail);
    return { success: false, error: 'Invalid recipient email' };
  }

  const baseUrl = (appBaseUrl || process.env.NEXT_PUBLIC_APP_URL || 'https://www.minglebooth.id').replace(/\/$/, '');
  const dashboardUrl = `${baseUrl}/dashboard?welcome=1`;

  const htmlContent = renderWelcomeEmailHtml({
    studioName,
    email: toEmail,
    dashboardUrl,
  });

  const payload = {
    sender: {
      name: senderName,
      email: senderEmail,
    },
    to: [
      {
        email: toEmail.toLowerCase().trim(),
        name: studioName.trim(),
      },
    ],
    subject: 'Selamat Datang di MingleBooth — Akun Studio Anda Telah Siap!',
    htmlContent,
  };

  const controller = new AbortController();
  const timeoutMs = 8000;
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'api-key': apiKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const data = await res.json().catch(() => ({}));

    if (res.ok && (res.status === 200 || res.status === 201)) {
      const messageId = data?.messageId || `brevo_${Date.now()}`;
      console.log(`[Brevo] ✉️ Welcome email dispatched successfully to ${toEmail}. MessageId: ${messageId}`);
      return {
        success: true,
        messageId,
      };
    }

    const errorMsg = data?.message || data?.code || `HTTP ${res.status} ${res.statusText}`;
    console.error(`[Brevo] ⚠️ Brevo API rejected email to ${toEmail} (${res.status}): ${errorMsg}`);
    return {
      success: false,
      error: errorMsg,
    };
  } catch (err: any) {
    clearTimeout(timeoutId);
    const isTimeout = err.name === 'AbortError';
    const message = isTimeout ? `Request timed out after ${timeoutMs}ms` : err.message;
    console.error(`[Brevo] ⚠️ Dispatch exception for ${toEmail}: ${message}`);
    return {
      success: false,
      error: message,
    };
  }
}

