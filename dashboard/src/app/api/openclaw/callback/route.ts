import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';

// ─── OpenClaw Callback Webhook ──────────────────────────────────────
// Receives async results from OpenClaw agent runs:
//   - Follow-back messages (cron/heartbeat results)
//   - Voice call status updates
//   - Task completion reports
//   - Proactive notifications

export async function POST(request: NextRequest) {
  try {
    // Authenticate with hook token
    const authHeader = request.headers.get('authorization');
    const hookToken = process.env.OPENCLAW_HOOK_TOKEN;

    if (!hookToken || authHeader !== `Bearer ${hookToken}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { type, conversation_id, task_id, message, data } = body;

    switch (type) {
      // ── Follow-back: OpenClaw posts a message into a chat conversation ──
      case 'chat_message': {
        if (!conversation_id || !message) {
          return NextResponse.json({ error: 'conversation_id and message required' }, { status: 400 });
        }

        await pool.query(
          `INSERT INTO messages (conversation_id, role, content, action_type)
           VALUES ($1, 'assistant', $2, 'openclaw_followback')`,
          [conversation_id, message]
        );

        await pool.query(
          `UPDATE conversations SET updated_at = NOW() WHERE id = $1`,
          [conversation_id]
        );

        await pool.query(
          `INSERT INTO agent_logs (action, details, status) VALUES ($1, $2, 'success')`,
          ['openclaw_followback', JSON.stringify({ conversation_id, preview: message.slice(0, 100) })]
        );

        return NextResponse.json({ ok: true, type: 'chat_message' });
      }

      // ── Voice call status update ──
      case 'call_status': {
        const { call_id, phone_number, status, summary, duration, transcript } = data || {};

        if (call_id) {
          // Match by call UUID or Twilio SID
          await pool.query(
            `UPDATE calls SET status = $1, summary = COALESCE($2, summary),
             duration_seconds = COALESCE($3, duration_seconds),
             transcript = COALESCE($4, transcript),
             ended_at = NOW()
             WHERE id = $5 OR twilio_call_sid = $5`,
            [status || 'completed', summary, duration, transcript, call_id]
          );
        } else if (phone_number) {
          // Fallback: match by phone number on the most recent in_progress call
          await pool.query(
            `UPDATE calls SET status = $1, summary = COALESCE($2, summary),
             duration_seconds = COALESCE($3, duration_seconds),
             transcript = COALESCE($4, transcript),
             ended_at = NOW()
             WHERE id = (
               SELECT id FROM calls
               WHERE phone_number = $5 AND status = 'in_progress'
               ORDER BY created_at DESC LIMIT 1
             )`,
            [status || 'completed', summary, duration, transcript, phone_number]
          );
        }

        // Update linked task if provided
        if (task_id) {
          const newStatus = status === 'completed' ? 'completed' : status === 'failed' ? 'failed' : 'in_progress';
          await pool.query(
            `UPDATE tasks SET status = $1, updated_at = NOW() WHERE id = $2`,
            [newStatus, task_id]
          );
        }

        // Create notification
        await pool.query(
          `INSERT INTO notifications (type, title, message, related_task_id)
           VALUES ($1, $2, $3, $4)`,
          [
            status === 'completed' ? 'call_completed' : 'call_update',
            `Call ${status || 'update'}: ${phone_number || 'unknown'}`,
            summary || `Voice call status updated to ${status}`,
            task_id || null,
          ]
        );

        await pool.query(
          `INSERT INTO agent_logs (action, details, status) VALUES ($1, $2, 'success')`,
          ['call_status_callback', JSON.stringify({ call_id, phone_number, status, task_id })]
        );

        return NextResponse.json({ ok: true, type: 'call_status' });
      }

      // ── Task update from OpenClaw ──
      case 'task_update': {
        if (!task_id) {
          return NextResponse.json({ error: 'task_id required' }, { status: 400 });
        }

        const updates = data || {};
        if (updates.status) {
          await pool.query(
            `UPDATE tasks SET status = $1, updated_at = NOW() WHERE id = $2`,
            [updates.status, task_id]
          );
        }
        if (updates.description) {
          await pool.query(
            `UPDATE tasks SET description = COALESCE(description, '') || E'\n\n' || $1, updated_at = NOW() WHERE id = $2`,
            [updates.description, task_id]
          );
        }

        await pool.query(
          `INSERT INTO notifications (type, title, message, related_task_id)
           VALUES ('task_update', $1, $2, $3)`,
          [
            `Task updated by agent`,
            updates.summary || `Task ${task_id} updated via OpenClaw`,
            task_id,
          ]
        );

        await pool.query(
          `INSERT INTO agent_logs (action, details, status) VALUES ($1, $2, 'success')`,
          ['task_update_callback', JSON.stringify({ task_id, updates })]
        );

        return NextResponse.json({ ok: true, type: 'task_update' });
      }

      // ── Proactive notification from OpenClaw (cron, heartbeat) ──
      case 'notification': {
        const notifType = data?.notification_type || 'agent_update';
        const title = data?.title || 'Agent Update';
        const notifMessage = message || data?.message || 'OpenClaw agent update';

        await pool.query(
          `INSERT INTO notifications (type, title, message, related_task_id)
           VALUES ($1, $2, $3, $4)`,
          [notifType, title, notifMessage, task_id || null]
        );

        await pool.query(
          `INSERT INTO agent_logs (action, details, status) VALUES ($1, $2, 'success')`,
          ['openclaw_notification', JSON.stringify({ type: notifType, title })]
        );

        return NextResponse.json({ ok: true, type: 'notification' });
      }

      default:
        return NextResponse.json({ error: `Unknown callback type: ${type}` }, { status: 400 });
    }
  } catch (error) {
    console.error('OpenClaw callback error:', error);
    return NextResponse.json(
      { error: 'Callback processing failed' },
      { status: 500 }
    );
  }
}
