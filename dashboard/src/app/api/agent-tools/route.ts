import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';

// GET all agent tools
export async function GET() {
  try {
    const result = await pool.query(
      'SELECT * FROM agent_tools ORDER BY tool_type, name'
    );
    return NextResponse.json(result.rows);
  } catch (error) {
    console.error('Agent tools GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch tools' }, { status: 500 });
  }
}

// PATCH toggle tool or update config
export async function PATCH(request: NextRequest) {
  try {
    const { id, is_enabled, config } = await request.json();
    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const updates: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    if (is_enabled !== undefined) { updates.push(`is_enabled = $${paramIdx++}`); params.push(is_enabled); }
    if (config !== undefined) { updates.push(`config = $${paramIdx++}`); params.push(JSON.stringify(config)); }

    if (updates.length === 0) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
    }

    params.push(id);
    const result = await pool.query(
      `UPDATE agent_tools SET ${updates.join(', ')} WHERE id = $${paramIdx} RETURNING *`,
      params
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json(result.rows[0]);
  } catch (error) {
    console.error('Agent tools PATCH error:', error);
    return NextResponse.json({ error: 'Failed to update tool' }, { status: 500 });
  }
}
