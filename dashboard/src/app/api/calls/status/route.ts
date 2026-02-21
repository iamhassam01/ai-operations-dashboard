import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { notifyOwner } from '@/lib/email';

// Twilio status callback — receives call status updates, recording URLs, transcriptions
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const event = request.nextUrl.searchParams.get('event');
    const callSid = formData.get('CallSid') as string;

    if (event === 'transcription') {
      // Handle Twilio transcription callback
      const transcriptionText = formData.get('TranscriptionText') as string;
      const recordingSid = formData.get('RecordingSid') as string;

      if (transcriptionText && callSid) {
        await pool.query(
          `UPDATE calls SET transcript = $1, updated_at = NOW() WHERE twilio_call_sid = $2`,
          [transcriptionText, callSid]
        );

        // Log the transcription event
        await pool.query(
          `INSERT INTO call_logs (id, call_id, event_type, event_data, created_at)
           VALUES (gen_random_uuid(), 
             (SELECT id FROM calls WHERE twilio_call_sid = $1 LIMIT 1),
             'transcription_received', $2, NOW())`,
          [callSid, JSON.stringify({ transcriptionText, recordingSid })]
        );
      }

      return NextResponse.json({ received: true });
    }

    // Standard status callback
    const callStatus = formData.get('CallStatus') as string;
    const callDuration = formData.get('CallDuration') as string;
    const recordingUrl = formData.get('RecordingUrl') as string;
    const recordingSid = formData.get('RecordingSid') as string;
    const recordingDuration = formData.get('RecordingDuration') as string;

    if (!callSid) {
      return NextResponse.json({ error: 'Missing CallSid' }, { status: 400 });
    }

    // Map Twilio status to our status
    const statusMap: Record<string, string> = {
      'queued': 'pending',
      'ringing': 'pending',
      'in-progress': 'in_progress',
      'completed': 'completed',
      'busy': 'no_answer',
      'no-answer': 'no_answer',
      'canceled': 'failed',
      'failed': 'failed',
    };
    const mappedStatus = statusMap[callStatus] || callStatus;

    // Build dynamic update
    const updates: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    if (mappedStatus) {
      updates.push(`status = $${paramIdx++}`);
      params.push(mappedStatus);
    }

    if (callDuration) {
      updates.push(`duration_seconds = $${paramIdx++}`);
      params.push(parseInt(callDuration));
    }

    if (recordingUrl) {
      // Twilio recording URLs need .mp3 appended for direct playback
      const fullRecordingUrl = recordingUrl.endsWith('.mp3') ? recordingUrl : `${recordingUrl}.mp3`;
      updates.push(`recording_url = $${paramIdx++}`);
      params.push(fullRecordingUrl);
    }

    if (mappedStatus === 'completed') {
      updates.push(`ended_at = NOW()`);
    }

    if (updates.length > 0) {
      params.push(callSid);
      await pool.query(
        `UPDATE calls SET ${updates.join(', ')} WHERE twilio_call_sid = $${paramIdx}`,
        params
      );
    }

    // Log the status event
    const callRes = await pool.query(
      'SELECT id FROM calls WHERE twilio_call_sid = $1 LIMIT 1',
      [callSid]
    );
    if (callRes.rows[0]) {
      await pool.query(
        `INSERT INTO call_logs (id, call_id, event_type, event_data, created_at)
         VALUES (gen_random_uuid(), $1, 'status_update', $2, NOW())`,
        [
          callRes.rows[0].id,
          JSON.stringify({ callStatus, callDuration, recordingUrl, recordingSid, recordingDuration }),
        ]
      );
    }

    // If call completed, create/update notification
    if (mappedStatus === 'completed' && callRes.rows[0]) {
      const callDetails = await pool.query(
        'SELECT id, direction, phone_number, caller_name, duration_seconds FROM calls WHERE twilio_call_sid = $1',
        [callSid]
      );
      const call = callDetails.rows[0];
      if (call) {
        const adminUser = await pool.query("SELECT id FROM users WHERE role = 'admin' LIMIT 1");
        if (adminUser.rows[0]) {
          const duration = call.duration_seconds ? `${Math.floor(call.duration_seconds / 60)}m ${call.duration_seconds % 60}s` : 'unknown duration';
          await pool.query(
            `INSERT INTO notifications (id, user_id, type, title, message, related_call_id, created_at)
             VALUES (gen_random_uuid(), $1, 'call_completed', $2, $3, $4, NOW())`,
            [
              adminUser.rows[0].id,
              `${call.direction === 'inbound' ? 'Inbound' : 'Outbound'} call completed`,
              `Call ${call.direction === 'inbound' ? 'from' : 'to'} ${call.caller_name || call.phone_number} completed (${duration}).${recordingUrl ? ' Recording available.' : ''}`,
              call.id,
            ]
          );
        }

        // Send email notification for completed calls
        try {
          const duration = call.duration_seconds ? `${Math.floor(call.duration_seconds / 60)}m ${call.duration_seconds % 60}s` : 'unknown duration';
          await notifyOwner(
            `Call Completed: ${call.caller_name || call.phone_number}`,
            `${call.direction === 'inbound' ? 'Inbound' : 'Outbound'} call ${call.direction === 'inbound' ? 'from' : 'to'} ${call.caller_name || call.phone_number} has completed.\n\nDuration: ${duration}\n${recordingUrl ? 'Recording is available in the dashboard.' : ''}\n\nView in dashboard: https://gloura.me/calls`
          );
        } catch {
          // Email is non-critical
        }
      }
    }

    return NextResponse.json({ received: true, status: mappedStatus });
  } catch (error) {
    console.error('Status callback error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
