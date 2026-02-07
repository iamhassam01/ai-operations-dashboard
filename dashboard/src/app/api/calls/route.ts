import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
    const direction = searchParams.get('direction');
    const status = searchParams.get('status');
    const taskId = searchParams.get('task_id');

    let query = `
      SELECT c.*, t.title as task_title
      FROM calls c
      LEFT JOIN tasks t ON c.task_id = t.id
    `;
    const params: unknown[] = [];
    const conditions: string[] = [];

    if (direction) {
      params.push(direction);
      conditions.push(`c.direction = $${params.length}`);
    }

    if (status) {
      params.push(status);
      conditions.push(`c.status = $${params.length}`);
    }

    if (taskId) {
      params.push(taskId);
      conditions.push(`c.task_id = $${params.length}`);
    }

    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }

    query += ` ORDER BY c.created_at DESC LIMIT $${params.length + 1}`;
    params.push(limit);

    const result = await pool.query(query, params);

    return NextResponse.json(result.rows);
  } catch (error) {
    console.error('Calls API error:', error);
    return NextResponse.json({ error: 'Failed to fetch calls' }, { status: 500 });
  }
}
