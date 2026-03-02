import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';

// GET collections with summary stats
export async function GET() {
  try {
    const result = await pool.query(`
      SELECT
        kc.id, kc.name, kc.description, kc.icon, kc.created_at,
        COUNT(DISTINCT ke.category) AS categories_count,
        COUNT(ke.id) AS entries_count
      FROM knowledge_collections kc
      LEFT JOIN knowledge_entries ke ON ke.collection_id = kc.id
      GROUP BY kc.id
      ORDER BY kc.name
    `);

    return NextResponse.json(result.rows);
  } catch (error) {
    console.error('Knowledge collections GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch collections' }, { status: 500 });
  }
}

// POST create collection
export async function POST(request: NextRequest) {
  try {
    const { name, description, icon } = await request.json();
    if (!name) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }

    const result = await pool.query(
      `INSERT INTO knowledge_collections (name, description, icon)
       VALUES ($1, $2, $3) RETURNING *`,
      [name, description || null, icon || 'folder']
    );

    return NextResponse.json(result.rows[0], { status: 201 });
  } catch (error) {
    console.error('Knowledge collections POST error:', error);
    return NextResponse.json({ error: 'Failed to create collection' }, { status: 500 });
  }
}
