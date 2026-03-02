import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';

// GET memory facts with optional category filter + search
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');
    const search = searchParams.get('search');
    const tab = searchParams.get('tab');

    // Stats mode
    if (tab === 'stats') {
      const [factsRes, stylesRes, convosRes] = await Promise.all([
        pool.query('SELECT COUNT(*) as count FROM agent_memory_facts'),
        pool.query('SELECT COUNT(*) as count FROM agent_memory_styles'),
        pool.query('SELECT COUNT(*) as count FROM conversations'),
      ]);
      return NextResponse.json({
        facts: parseInt(factsRes.rows[0].count),
        styles: parseInt(stylesRes.rows[0].count),
        conversations: parseInt(convosRes.rows[0].count),
      });
    }

    // Categories mode
    if (tab === 'categories') {
      const result = await pool.query(
        `SELECT category, COUNT(*) as count FROM agent_memory_facts GROUP BY category ORDER BY count DESC`
      );
      return NextResponse.json(result.rows);
    }

    // Styles mode
    if (tab === 'styles') {
      const result = await pool.query(
        'SELECT * FROM agent_memory_styles ORDER BY created_at DESC'
      );
      return NextResponse.json(result.rows);
    }

    // Facts list with filters
    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (category && category !== 'all') {
      conditions.push(`category = $${idx++}`);
      params.push(category);
    }
    if (search) {
      conditions.push(`(key ILIKE $${idx} OR value ILIKE $${idx})`);
      params.push(`%${search}%`);
      idx++;
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await pool.query(
      `SELECT * FROM agent_memory_facts ${where} ORDER BY updated_at DESC`,
      params
    );

    return NextResponse.json(result.rows);
  } catch (error) {
    console.error('Memory facts GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch memory facts' }, { status: 500 });
  }
}

// POST create a new memory fact
export async function POST(request: NextRequest) {
  try {
    const { key, value, category, source } = await request.json();

    if (!key || !value) {
      return NextResponse.json({ error: 'key and value are required' }, { status: 400 });
    }

    const result = await pool.query(
      `INSERT INTO agent_memory_facts (key, value, category, source)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (key) DO UPDATE SET value = $2, category = $3, updated_at = NOW()
       RETURNING *`,
      [key, value, category || 'general', source || 'manual']
    );

    return NextResponse.json(result.rows[0], { status: 201 });
  } catch (error) {
    console.error('Memory facts POST error:', error);
    return NextResponse.json({ error: 'Failed to create memory fact' }, { status: 500 });
  }
}

// PATCH update a memory fact
export async function PATCH(request: NextRequest) {
  try {
    const { id, key, value, category } = await request.json();
    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const updates: string[] = ['updated_at = NOW()'];
    const params: unknown[] = [];
    let paramIdx = 1;

    if (key !== undefined) { updates.push(`key = $${paramIdx++}`); params.push(key); }
    if (value !== undefined) { updates.push(`value = $${paramIdx++}`); params.push(value); }
    if (category !== undefined) { updates.push(`category = $${paramIdx++}`); params.push(category); }

    params.push(id);
    const result = await pool.query(
      `UPDATE agent_memory_facts SET ${updates.join(', ')} WHERE id = $${paramIdx} RETURNING *`,
      params
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json(result.rows[0]);
  } catch (error) {
    console.error('Memory facts PATCH error:', error);
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
  }
}

// DELETE a memory fact
export async function DELETE(request: NextRequest) {
  try {
    const { id } = await request.json();
    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const result = await pool.query(
      'DELETE FROM agent_memory_facts WHERE id = $1 RETURNING id',
      [id]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Memory facts DELETE error:', error);
    return NextResponse.json({ error: 'Failed to delete' }, { status: 500 });
  }
}
