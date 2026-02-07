import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100);
    const unreadOnly = searchParams.get('unread') === 'true';

    let query = `
      SELECT id, type, title, message, is_read, related_task_id, related_call_id, created_at
      FROM notifications
    `;

    const params: unknown[] = [];
    const type = searchParams.get('type');
    const conditions: string[] = [];

    if (unreadOnly) {
      conditions.push('is_read = false');
    }

    if (type) {
      params.push(type);
      conditions.push(`type = $${params.length}`);
    }

    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }

    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`;
    params.push(limit);

    const result = await pool.query(query, params);
    return NextResponse.json(result.rows);
  } catch (error) {
    console.error('Notifications API error:', error);
    return NextResponse.json({ error: 'Failed to fetch notifications' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();

    // Mark all as read
    if (body.markAllRead) {
      await pool.query('UPDATE notifications SET is_read = true WHERE is_read = false');
      return NextResponse.json({ success: true });
    }

    // Mark single notification as read
    if (body.id && body.is_read !== undefined) {
      const result = await pool.query(
        'UPDATE notifications SET is_read = $1 WHERE id = $2 RETURNING *',
        [body.is_read, body.id]
      );

      if (result.rows.length === 0) {
        return NextResponse.json({ error: 'Notification not found' }, { status: 404 });
      }

      return NextResponse.json(result.rows[0]);
    }

    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  } catch (error) {
    console.error('Update notification error:', error);
    return NextResponse.json({ error: 'Failed to update notification' }, { status: 500 });
  }
}
