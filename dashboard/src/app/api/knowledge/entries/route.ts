import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';

// GET entries with filters
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const collectionId = searchParams.get('collection_id');
    const category = searchParams.get('category');
    const search = searchParams.get('search');
    const recent = searchParams.get('recent');

    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (collectionId) {
      conditions.push(`ke.collection_id = $${idx++}`);
      params.push(parseInt(collectionId));
    }
    if (category) {
      conditions.push(`ke.category = $${idx++}`);
      params.push(category);
    }
    if (search) {
      conditions.push(`(ke.title ILIKE $${idx} OR ke.content ILIKE $${idx})`);
      params.push(`%${search}%`);
      idx++;
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = recent ? `LIMIT ${parseInt(recent)}` : '';

    const result = await pool.query(
      `SELECT ke.*, kc.name as collection_name
       FROM knowledge_entries ke
       LEFT JOIN knowledge_collections kc ON kc.id = ke.collection_id
       ${where}
       ORDER BY ke.updated_at DESC ${limit}`,
      params
    );

    return NextResponse.json(result.rows);
  } catch (error) {
    console.error('Knowledge entries GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch entries' }, { status: 500 });
  }
}

// POST create entry
export async function POST(request: NextRequest) {
  try {
    const { collection_id, category, title, content, metadata } = await request.json();

    if (!collection_id || !title || !content) {
      return NextResponse.json({ error: 'collection_id, title, and content are required' }, { status: 400 });
    }

    const result = await pool.query(
      `INSERT INTO knowledge_entries (collection_id, category, title, content, metadata)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [collection_id, category || 'general', title, content, JSON.stringify(metadata || {})]
    );

    return NextResponse.json(result.rows[0], { status: 201 });
  } catch (error) {
    console.error('Knowledge entries POST error:', error);
    return NextResponse.json({ error: 'Failed to create entry' }, { status: 500 });
  }
}

// PATCH update entry
export async function PATCH(request: NextRequest) {
  try {
    const { id, category, title, content, collection_id } = await request.json();
    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const updates: string[] = ['updated_at = NOW()'];
    const params: unknown[] = [];
    let paramIdx = 1;

    if (title !== undefined) { updates.push(`title = $${paramIdx++}`); params.push(title); }
    if (content !== undefined) { updates.push(`content = $${paramIdx++}`); params.push(content); }
    if (category !== undefined) { updates.push(`category = $${paramIdx++}`); params.push(category); }
    if (collection_id !== undefined) { updates.push(`collection_id = $${paramIdx++}`); params.push(collection_id); }

    params.push(id);
    const result = await pool.query(
      `UPDATE knowledge_entries SET ${updates.join(', ')} WHERE id = $${paramIdx} RETURNING *`,
      params
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json(result.rows[0]);
  } catch (error) {
    console.error('Knowledge entries PATCH error:', error);
    return NextResponse.json({ error: 'Failed to update entry' }, { status: 500 });
  }
}

// DELETE entry
export async function DELETE(request: NextRequest) {
  try {
    const { id } = await request.json();
    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const result = await pool.query(
      'DELETE FROM knowledge_entries WHERE id = $1 RETURNING id',
      [id]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Knowledge entries DELETE error:', error);
    return NextResponse.json({ error: 'Failed to delete entry' }, { status: 500 });
  }
}
