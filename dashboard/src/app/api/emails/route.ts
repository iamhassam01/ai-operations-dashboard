import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
    const taskId = searchParams.get('task_id');
    const direction = searchParams.get('direction');
    const status = searchParams.get('status');
    const countOnly = searchParams.get('count_only');

    // Count-only mode for badge
    if (countOnly === 'true') {
      const countQuery = `SELECT COUNT(*) as count FROM emails WHERE status = 'received'`;
      const countRes = await pool.query(countQuery);
      return NextResponse.json({ count: parseInt(countRes.rows[0].count) });
    }

    let query = `
      SELECT e.*, t.title as task_title, c.name as contact_name
      FROM emails e
      LEFT JOIN tasks t ON e.task_id = t.id
      LEFT JOIN contacts c ON e.related_contact_id = c.id
    `;
    const params: unknown[] = [];
    const conditions: string[] = [];

    if (taskId) {
      params.push(taskId);
      conditions.push(`e.task_id = $${params.length}`);
    }

    if (direction) {
      params.push(direction);
      conditions.push(`e.direction = $${params.length}`);
    }

    if (status) {
      params.push(status);
      conditions.push(`e.status = $${params.length}`);
    }

    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }

    query += ` ORDER BY e.created_at DESC LIMIT $${params.length + 1}`;
    params.push(limit);

    const result = await pool.query(query, params);
    return NextResponse.json(result.rows);
  } catch (error) {
    console.error('Emails API error:', error);
    return NextResponse.json({ error: 'Failed to fetch emails' }, { status: 500 });
  }
}

// Webhook endpoint for OpenClaw to log emails it sends/receives
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { task_id, direction, from_address, to_address, subject, body_text, body_html, status, ai_drafted, related_contact_id } = body;

    if (!to_address || !subject || !from_address) {
      return NextResponse.json({ error: 'from_address, to_address, and subject are required' }, { status: 400 });
    }

    const validDirections = ['sent', 'received'];
    const validStatuses = ['draft', 'pending_approval', 'sent', 'delivered', 'failed', 'received'];

    const emailDirection = validDirections.includes(direction) ? direction : 'sent';
    const emailStatus = validStatuses.includes(status) ? status : (emailDirection === 'received' ? 'received' : 'sent');

    const result = await pool.query(
      `INSERT INTO emails (task_id, direction, from_address, to_address, subject, body_text, body_html, status, ai_drafted, related_contact_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        task_id || null,
        emailDirection,
        from_address,
        to_address,
        subject,
        body_text || null,
        body_html || null,
        emailStatus,
        ai_drafted || false,
        related_contact_id || null,
      ]
    );

    // Create notification for received emails so user sees them in dashboard
    if (emailDirection === 'received') {
      await pool.query(
        `INSERT INTO notifications (type, title, message, related_task_id)
         VALUES ('email_received', $1, $2, $3)`,
        [
          `Email from ${from_address}`,
          `Subject: ${subject}`,
          task_id || null,
        ]
      );
    }

    // Create notification for sent emails
    if (emailStatus === 'sent' || emailStatus === 'delivered') {
      await pool.query(
        `INSERT INTO notifications (type, title, message, related_task_id)
         VALUES ('email_sent', $1, $2, $3)`,
        [
          `Email sent to ${to_address}`,
          `Subject: ${subject}`,
          task_id || null,
        ]
      );
    }

    return NextResponse.json(result.rows[0], { status: 201 });
  } catch (error) {
    console.error('Create email error:', error);
    return NextResponse.json({ error: 'Failed to create email' }, { status: 500 });
  }
}
