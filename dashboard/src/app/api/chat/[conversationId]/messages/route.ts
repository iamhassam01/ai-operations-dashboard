import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';

// GET messages for a conversation
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  try {
    const { conversationId } = await params;
    const limit = Math.min(parseInt(request.nextUrl.searchParams.get('limit') || '50'), 200);

    const result = await pool.query(
      `SELECT id, role, content, action_type, action_data, related_task_id, related_call_id, created_at
       FROM messages
       WHERE conversation_id = $1
       ORDER BY created_at ASC
       LIMIT $2`,
      [conversationId, limit]
    );

    return NextResponse.json(result.rows);
  } catch (error) {
    console.error('Messages API error:', error);
    return NextResponse.json({ error: 'Failed to fetch messages' }, { status: 500 });
  }
}
