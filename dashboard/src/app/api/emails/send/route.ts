import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { sendNotificationEmail } from '@/lib/email';

export async function POST(request: NextRequest) {
  try {
    const { task_id, to_address, subject, body_text, body_html, ai_drafted } = await request.json();

    if (!to_address || !subject || !body_text) {
      return NextResponse.json(
        { error: 'to_address, subject, and body_text are required' },
        { status: 400 }
      );
    }

    // Get from address from settings
    const settingsRes = await pool.query(
      "SELECT key, value FROM settings WHERE key IN ('notification_email', 'primary_email', 'business_name')"
    );
    const settingsMap: Record<string, string> = {};
    settingsRes.rows.forEach((r: { key: string; value: string }) => {
      settingsMap[r.key] = typeof r.value === 'string' ? r.value.replace(/"/g, '') : String(r.value);
    });
    const fromAddress = settingsMap.notification_email || settingsMap.primary_email || process.env.SMTP_USER || 'noreply@gloura.me';
    const businessName = settingsMap.business_name || 'Gloura AI Assistant';

    // Actually send via SMTP
    const sent = await sendNotificationEmail({
      to: to_address,
      subject,
      text: body_text,
      html: body_html || undefined,
    });

    const emailStatus = sent ? 'sent' : 'failed';

    // Log to emails table
    const result = await pool.query(
      `INSERT INTO emails (task_id, direction, from_address, to_address, subject, body_text, body_html, status, ai_drafted)
       VALUES ($1, 'sent', $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        task_id || null,
        `${businessName} <${fromAddress}>`,
        to_address,
        subject,
        body_text,
        body_html || null,
        emailStatus,
        ai_drafted || false,
      ]
    );

    // Create notification
    await pool.query(
      `INSERT INTO notifications (type, title, message, related_task_id)
       VALUES ($1, $2, $3, $4)`,
      [
        sent ? 'email_sent' : 'error',
        sent ? `Email sent to ${to_address}` : `Email failed to ${to_address}`,
        `Subject: ${subject}`,
        task_id || null,
      ]
    );

    // Log agent action
    await pool.query(
      `INSERT INTO agent_logs (id, action, details, status, created_at)
       VALUES (gen_random_uuid(), 'email_sent', $1, $2, NOW())`,
      [
        JSON.stringify({ to: to_address, subject, from: fromAddress }),
        sent ? 'success' : 'failure',
      ]
    );

    if (!sent) {
      return NextResponse.json(
        { ...result.rows[0], warning: 'Email saved but SMTP delivery failed. Check SMTP configuration.' },
        { status: 207 }
      );
    }

    return NextResponse.json(result.rows[0], { status: 201 });
  } catch (error) {
    console.error('Email send error:', error);
    return NextResponse.json({ error: 'Failed to send email' }, { status: 500 });
  }
}
