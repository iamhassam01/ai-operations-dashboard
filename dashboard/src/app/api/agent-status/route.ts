import { NextResponse } from 'next/server';
import pool from '@/lib/db';

// GET agent overview stats (for Agent page overview tab)
export async function GET() {
  try {
    const [
      sessionsRes,
      factsRes,
      toolsRes,
      logsRes,
      convosRes,
    ] = await Promise.all([
      pool.query('SELECT COUNT(*) as count FROM conversations'),
      pool.query('SELECT COUNT(*) as count FROM agent_memory_facts'),
      pool.query('SELECT COUNT(*) as count FROM agent_tools WHERE is_enabled = true'),
      pool.query(
        `SELECT action, COUNT(*) as count FROM agent_logs
         WHERE created_at > NOW() - INTERVAL '24 hours'
         GROUP BY action ORDER BY count DESC LIMIT 10`
      ),
      pool.query(
        `SELECT id, title, updated_at FROM conversations
         ORDER BY updated_at DESC LIMIT 5`
      ),
    ]);

    return NextResponse.json({
      sessions: parseInt(sessionsRes.rows[0].count),
      memory_facts: parseInt(factsRes.rows[0].count),
      active_tools: parseInt(toolsRes.rows[0].count),
      recent_activity: logsRes.rows,
      recent_conversations: convosRes.rows,
      agent: {
        name: 'Bob',
        identity: 'Mr. Ermakov',
        model: 'openai/gpt-4o',
        version: '2026.3.1',
      },
    });
  } catch (error) {
    console.error('Agent status GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch agent status' }, { status: 500 });
  }
}
