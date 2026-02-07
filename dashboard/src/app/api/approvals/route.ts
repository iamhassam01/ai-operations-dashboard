import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';

export async function GET() {
  try {
    const result = await pool.query(
      `SELECT a.*, t.title as task_title, c.phone_number
       FROM approvals a
       LEFT JOIN tasks t ON a.task_id = t.id
       LEFT JOIN calls c ON a.call_id = c.id
       WHERE a.status = 'pending'
       ORDER BY a.created_at ASC`
    );

    return NextResponse.json(result.rows);
  } catch (error) {
    console.error('Approvals API error:', error);
    return NextResponse.json({ error: 'Failed to fetch approvals' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { id, status, notes } = await request.json();

    if (!id || !status) {
      return NextResponse.json({ error: 'id and status are required' }, { status: 400 });
    }

    // Get the admin user for approved_by
    const userResult = await pool.query(
      "SELECT id FROM users WHERE role = 'admin' LIMIT 1"
    );
    const approvedBy = userResult.rows[0]?.id || null;

    const result = await pool.query(
      `UPDATE approvals 
       SET status = $1, approved_at = NOW(), approved_by = $2, notes = COALESCE($3, notes)
       WHERE id = $4
       RETURNING *`,
      [status, approvedBy, notes || null, id]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Approval not found' }, { status: 404 });
    }

    const approval = result.rows[0];

    // If approved, update the related task status
    if (status === 'approved' && approval.task_id) {
      await pool.query(
        "UPDATE tasks SET status = 'approved', updated_at = NOW() WHERE id = $1",
        [approval.task_id]
      );

      // Trigger OpenClaw webhook for task execution
      try {
        const taskResult = await pool.query('SELECT title FROM tasks WHERE id = $1', [approval.task_id]);
        const taskTitle = taskResult.rows[0]?.title || 'Unknown task';
        
        await fetch(`${process.env.OPENCLAW_URL || 'http://127.0.0.1:18789'}/hooks/agent`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.OPENCLAW_HOOK_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: `Execute approved task: ${taskTitle}. Task ID: ${approval.task_id}. Action type: ${approval.action_type}.`,
            name: `Approved: ${taskTitle}`,
          }),
        });
      } catch (hookError) {
        console.error('Failed to trigger OpenClaw hook:', hookError);
        // Don't fail the approval if hook fails
      }
    }

    // If rejected, update the related task status
    if (status === 'rejected' && approval.task_id) {
      await pool.query(
        "UPDATE tasks SET status = 'cancelled', updated_at = NOW() WHERE id = $1",
        [approval.task_id]
      );
    }

    return NextResponse.json(approval);
  } catch (error) {
    console.error('Update approval error:', error);
    return NextResponse.json({ error: 'Failed to update approval' }, { status: 500 });
  }
}
