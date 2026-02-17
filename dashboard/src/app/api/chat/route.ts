import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';

// GET conversations list
export async function GET(request: NextRequest) {
  try {
    const limit = Math.min(parseInt(request.nextUrl.searchParams.get('limit') || '20'), 50);

    const result = await pool.query(
      `SELECT c.id, c.title, c.is_active, c.created_at, c.updated_at,
              (SELECT content FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message
       FROM conversations c
       ORDER BY c.updated_at DESC
       LIMIT $1`,
      [limit]
    );

    return NextResponse.json(result.rows);
  } catch (error) {
    console.error('Conversations API error:', error);
    return NextResponse.json({ error: 'Failed to fetch conversations' }, { status: 500 });
  }
}

// POST create new conversation
export async function POST() {
  try {
    const result = await pool.query(
      `INSERT INTO conversations (title, is_active) VALUES ('New conversation', true) RETURNING *`
    );
    return NextResponse.json(result.rows[0], { status: 201 });
  } catch (error) {
    console.error('Create conversation error:', error);
    return NextResponse.json({ error: 'Failed to create conversation' }, { status: 500 });
  }
}
