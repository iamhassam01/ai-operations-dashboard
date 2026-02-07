import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const result = await pool.query('SELECT * FROM tasks WHERE id = $1', [id]);
    
    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    return NextResponse.json(result.rows[0]);
  } catch (error) {
    console.error('Task detail error:', error);
    return NextResponse.json({ error: 'Failed to fetch task' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { status, title, description, priority, contact_name, contact_phone, contact_email, address, preferred_time_1, preferred_time_2, constraints } = body;

    const setClauses: string[] = ['updated_at = NOW()'];
    const values: (string | null)[] = [];
    let paramIdx = 1;

    const fields: [string, unknown][] = [
      ['status', status],
      ['title', title],
      ['description', description],
      ['priority', priority],
      ['contact_name', contact_name],
      ['contact_phone', contact_phone],
      ['contact_email', contact_email],
      ['address', address],
      ['preferred_time_1', preferred_time_1],
      ['preferred_time_2', preferred_time_2],
      ['constraints', constraints],
    ];

    for (const [field, value] of fields) {
      if (value !== undefined) {
        setClauses.push(`${field} = $${paramIdx}`);
        values.push(value as string | null);
        paramIdx++;
      }
    }

    values.push(id);
    const result = await pool.query(
      `UPDATE tasks SET ${setClauses.join(', ')} WHERE id = $${paramIdx} RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    return NextResponse.json(result.rows[0]);
  } catch (error) {
    console.error('Update task error:', error);
    return NextResponse.json({ error: 'Failed to update task' }, { status: 500 });
  }
}
