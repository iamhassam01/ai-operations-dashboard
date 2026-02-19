import pool from '@/lib/db';

interface EmailPayload {
  to: string;
  cc?: string;
  subject: string;
  text: string;
  html?: string;
}

async function getEmailSettings(): Promise<{ primaryEmail: string; ccEmail: string; emailEnabled: boolean }> {
  const res = await pool.query(
    "SELECT key, value FROM settings WHERE key IN ('primary_email', 'cc_email', 'notification_email', 'notification_email_enabled')"
  );
  const map: Record<string, string> = {};
  res.rows.forEach((r: { key: string; value: string }) => {
    map[r.key] = typeof r.value === 'string' ? r.value.replace(/"/g, '') : String(r.value);
  });
  return {
    primaryEmail: map.notification_email || map.primary_email || '',
    ccEmail: map.cc_email || '',
    emailEnabled: map.notification_email_enabled !== 'false',
  };
}

// Send notification email using SMTP
// Requires SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS env vars
// Falls back to logging if SMTP not configured
export async function sendNotificationEmail(payload: EmailPayload): Promise<boolean> {
  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = process.env.SMTP_PORT || '587';
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const smtpFrom = process.env.SMTP_FROM || smtpUser;

  if (!smtpHost || !smtpUser || !smtpPass) {
    console.log(`[Email] SMTP not configured. Would send to ${payload.to}: ${payload.subject}`);
    // Log the email attempt for audit trail
    await pool.query(
      `INSERT INTO agent_logs (id, action, details, status, created_at)
       VALUES (gen_random_uuid(), 'email_notification', $1, 'pending', NOW())`,
      [JSON.stringify({ to: payload.to, cc: payload.cc, subject: payload.subject, reason: 'SMTP not configured' })]
    );
    return false;
  }

  try {
    // Dynamic require to avoid build errors when nodemailer isn't installed
    let nodemailer: { createTransport: (...args: unknown[]) => { sendMail: (opts: Record<string, unknown>) => Promise<unknown> } } | null = null;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      nodemailer = require('nodemailer');
    } catch {
      nodemailer = null;
    }

    if (!nodemailer) {
      console.log(`[Email] nodemailer not installed. Would send to ${payload.to}: ${payload.subject}`);
      await pool.query(
        `INSERT INTO agent_logs (id, action, details, status, created_at)
         VALUES (gen_random_uuid(), 'email_notification', $1, 'pending', NOW())`,
        [JSON.stringify({ to: payload.to, cc: payload.cc, subject: payload.subject, reason: 'nodemailer not installed' })]
      );
      return false;
    }

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: parseInt(smtpPort),
      secure: parseInt(smtpPort) === 465,
      auth: { user: smtpUser, pass: smtpPass },
    });

    await transporter.sendMail({
      from: `"Gloura Dashboard" <${smtpFrom}>`,
      to: payload.to,
      cc: payload.cc || undefined,
      subject: payload.subject,
      text: payload.text,
      html: payload.html || undefined,
    });

    await pool.query(
      `INSERT INTO agent_logs (id, action, details, status, created_at)
       VALUES (gen_random_uuid(), 'email_notification', $1, 'success', NOW())`,
      [JSON.stringify({ to: payload.to, cc: payload.cc, subject: payload.subject })]
    );

    return true;
  } catch (error) {
    console.error('[Email] Send failed:', error);
    await pool.query(
      `INSERT INTO agent_logs (id, action, details, status, error_message, created_at)
       VALUES (gen_random_uuid(), 'email_notification', $1, 'failure', $2, NOW())`,
      [
        JSON.stringify({ to: payload.to, subject: payload.subject }),
        error instanceof Error ? error.message : 'Unknown error',
      ]
    );
    return false;
  }
}

// Higher-level function: send notification to the configured admin/owner
export async function notifyOwner(subject: string, message: string, html?: string): Promise<boolean> {
  const { primaryEmail, ccEmail, emailEnabled } = await getEmailSettings();

  if (!emailEnabled || !primaryEmail) {
    return false;
  }

  return sendNotificationEmail({
    to: primaryEmail,
    cc: ccEmail || undefined,
    subject: `[AI Dashboard] ${subject}`,
    text: message,
    html,
  });
}
