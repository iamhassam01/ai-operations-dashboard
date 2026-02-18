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

// PATCH update conversation title
export async function PATCH(request: NextRequest) {
  try {
    const { id, title } = await request.json();

    if (!id || !title || typeof title !== 'string' || title.trim().length === 0) {
      return NextResponse.json({ error: 'Conversation id and title are required' }, { status: 400 });
    }

    const result = await pool.query(
      `UPDATE conversations SET title = $1, updated_at = NOW() WHERE id = $2 RETURNING id, title, updated_at`,
      [title.trim().slice(0, 120), id]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    return NextResponse.json(result.rows[0]);
  } catch (error) {
    console.error('Update conversation error:', error);
    return NextResponse.json({ error: 'Failed to update conversation' }, { status: 500 });
  }
}

// DELETE conversation permanently (messages cascade via FK)
export async function DELETE(request: NextRequest) {
  try {
    const { id } = await request.json();

    if (!id) {
      return NextResponse.json({ error: 'Conversation id is required' }, { status: 400 });
    }

    const result = await pool.query(
      `DELETE FROM conversations WHERE id = $1 RETURNING id`,
      [id]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    return NextResponse.json({ deleted: true, id: result.rows[0].id });
  } catch (error) {
    console.error('Delete conversation error:', error);
    return NextResponse.json({ error: 'Failed to delete conversation' }, { status: 500 });
  }
}
