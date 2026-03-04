import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const result = await pool.query(
      `SELECT c.*, t.title as task_title, ct.name as contact_name, ct.company as contact_company
       FROM calls c
       LEFT JOIN tasks t ON c.task_id = t.id
       LEFT JOIN contacts ct ON c.phone_number = ct.phone_number
       WHERE c.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Call not found' }, { status: 404 });
    }

    return NextResponse.json(result.rows[0]);
  } catch (error) {
    console.error('Call detail error:', error);
    return NextResponse.json({ error: 'Failed to fetch call' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { captured_info, summary, status } = body;

    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (captured_info !== undefined) {
      updates.push(`captured_info = $${paramIndex}`);
      values.push(JSON.stringify(captured_info));
      paramIndex++;
    }

    if (summary !== undefined) {
      updates.push(`summary = $${paramIndex}`);
      values.push(summary);
      paramIndex++;
    }

    if (status !== undefined) {
      const validStatuses = ['pending', 'in_progress', 'completed', 'failed', 'no_answer'];
      if (!validStatuses.includes(status)) {
        return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
      }
      updates.push(`status = $${paramIndex}`);
      values.push(status);
      paramIndex++;
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    values.push(id);
    const result = await pool.query(
      `UPDATE calls SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Call not found' }, { status: 404 });
    }

    return NextResponse.json(result.rows[0]);
  } catch (error) {
    console.error('Update call error:', error);
    return NextResponse.json({ error: 'Failed to update call' }, { status: 500 });
  }
}
