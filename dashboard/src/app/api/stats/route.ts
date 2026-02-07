import { NextResponse } from 'next/server';
import pool from '@/lib/db';

export async function GET() {
  try {
    const [tasksRes, callsRes, approvalsRes, escalatedRes, totalRes] = await Promise.all([
      pool.query("SELECT COUNT(*) as count FROM tasks WHERE status = 'completed' AND created_at::date = CURRENT_DATE"),
      pool.query("SELECT COUNT(*) as count FROM calls WHERE created_at::date = CURRENT_DATE"),
      pool.query("SELECT COUNT(*) as count FROM approvals WHERE status = 'pending'"),
      pool.query("SELECT COUNT(*) as count FROM tasks WHERE status = 'escalated'"),
      pool.query("SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status = 'completed') as completed FROM tasks"),
    ]);

    const totalTasks = parseInt(totalRes.rows[0].total) || 0;
    const totalCompleted = parseInt(totalRes.rows[0].completed) || 0;
    const successRate = totalTasks > 0 ? Math.round((totalCompleted / totalTasks) * 100) : 0;

    return NextResponse.json({
      completed: parseInt(tasksRes.rows[0].count),
      calls_today: parseInt(callsRes.rows[0].count),
      pending_approvals: parseInt(approvalsRes.rows[0].count),
      escalated: parseInt(escalatedRes.rows[0].count),
      success_rate: successRate,
    });
  } catch (error) {
    console.error('Stats API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch stats' },
      { status: 500 }
    );
  }
}
