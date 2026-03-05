import { readFileSync, existsSync } from 'fs';
import pool from '@/lib/db';

// ─── OpenClaw Voice Call Sync ────────────────────────────────────────
// OpenClaw's voice_call tool is async & fire-and-forget — the hook session
// initiates the call but never waits for completion, so the callback
// instruction is never executed. Instead, we read OpenClaw's calls.jsonl
// directly (same server) to sync call outcomes into the dashboard DB.

const OPENCLAW_CALLS_JSONL = '/root/.openclaw/voice-calls/calls.jsonl';
const TIME_MATCH_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

interface OpenClawCallEntry {
  callId: string;
  state: string;
  from: string;
  to: string;
  startedAt: number;
  endedAt?: number;
  endReason?: string;
  transcript?: Array<{
    timestamp: number;
    speaker: string;
    text: string;
    isFinal: boolean;
  }>;
}

/**
 * Sync OpenClaw voice call outcomes with dashboard DB.
 * Reads the calls.jsonl file, finds completed/failed calls,
 * and updates any matching in_progress calls in the dashboard.
 *
 * Safe to call frequently — no-ops if no in_progress calls or no file.
 */
export async function syncOpenClawCalls(): Promise<{ synced: number; errors: string[] }> {
  const result = { synced: 0, errors: [] as string[] };

  try {
    // 1. Check for in_progress outbound calls in the dashboard
    const inProgressRes = await pool.query(
      `SELECT id, phone_number, task_id, created_at
       FROM calls
       WHERE status = 'in_progress' AND direction = 'outbound'
       ORDER BY created_at DESC`
    );

    if (inProgressRes.rows.length === 0) return result;

    // 2. Read OpenClaw's calls.jsonl
    if (!existsSync(OPENCLAW_CALLS_JSONL)) {
      result.errors.push('calls.jsonl not found');
      return result;
    }

    const content = readFileSync(OPENCLAW_CALLS_JSONL, 'utf-8');
    const lines = content.trim().split('\n').filter(Boolean);

    // 3. Parse: keep the LAST entry per OpenClaw callId (final state)
    const latestByCallId = new Map<string, OpenClawCallEntry>();
    for (const line of lines) {
      try {
        const entry: OpenClawCallEntry = JSON.parse(line);
        latestByCallId.set(entry.callId, entry);
      } catch {
        // skip malformed lines
      }
    }

    // Also collect ALL entries per callId to get transcripts from intermediate states
    const allEntriesByCallId = new Map<string, OpenClawCallEntry[]>();
    for (const line of lines) {
      try {
        const entry: OpenClawCallEntry = JSON.parse(line);
        const existing = allEntriesByCallId.get(entry.callId) || [];
        existing.push(entry);
        allEntriesByCallId.set(entry.callId, existing);
      } catch {
        // skip
      }
    }

    // 4. Terminal states that mean the call is done
    const terminalStates = new Set(['completed', 'hangup-bot', 'failed', 'no-answer', 'busy', 'canceled']);

    // 5. For each in_progress dashboard call, find matching OpenClaw call
    for (const dbCall of inProgressRes.rows) {
      const phone = dbCall.phone_number;
      const dbCreatedAt = new Date(dbCall.created_at).getTime();

      let bestMatch: OpenClawCallEntry | null = null;
      let bestTimeDiff = Infinity;

      for (const [, ocCall] of latestByCallId) {
        // Must match phone number
        if (ocCall.to !== phone) continue;

        // Must be within time window
        const timeDiff = Math.abs(ocCall.startedAt - dbCreatedAt);
        if (timeDiff > TIME_MATCH_WINDOW_MS) continue;

        // Must be in a terminal state
        if (!terminalStates.has(ocCall.state)) continue;

        // Pick the closest match in time
        if (timeDiff < bestTimeDiff) {
          bestTimeDiff = timeDiff;
          bestMatch = ocCall;
        }
      }

      if (!bestMatch) continue;

      // 6. Map OpenClaw state → dashboard status
      let newStatus: string;
      if (bestMatch.state === 'completed' || bestMatch.state === 'hangup-bot') {
        newStatus = 'completed';
      } else if (bestMatch.state === 'no-answer' || bestMatch.state === 'busy') {
        newStatus = 'no_answer';
      } else {
        newStatus = 'failed';
      }

      // 7. Extract the best transcript from all entries for this callId
      const allEntries = allEntriesByCallId.get(bestMatch.callId) || [];
      let bestTranscript: OpenClawCallEntry['transcript'] = [];
      for (const entry of allEntries) {
        if (entry.transcript && entry.transcript.length > (bestTranscript?.length || 0)) {
          bestTranscript = entry.transcript;
        }
      }

      // Build readable transcript and summary
      let transcriptText = '';
      let summary = `Call ${newStatus}.`;
      if (bestTranscript && bestTranscript.length > 0) {
        transcriptText = bestTranscript
          .map(t => `${t.speaker === 'bot' ? 'Agent' : 'Contact'}: ${t.text}`)
          .join('\n');

        // Build a brief summary from the agent's messages
        const agentMessages = bestTranscript
          .filter(t => t.speaker === 'bot')
          .map(t => t.text);
        const contactMessages = bestTranscript
          .filter(t => t.speaker === 'user')
          .map(t => t.text);

        if (agentMessages.length > 0) {
          summary = `Call ${newStatus}. Agent said: ${agentMessages[0]}`;
          if (contactMessages.length > 0) {
            summary += ` | Contact responded: ${contactMessages[0]}`;
          }
        }

        // Truncate summary to 500 chars
        if (summary.length > 500) {
          summary = summary.substring(0, 497) + '...';
        }
      }

      // 8. Calculate duration
      let durationSeconds: number | null = null;
      if (bestMatch.endedAt && bestMatch.startedAt) {
        durationSeconds = Math.round((bestMatch.endedAt - bestMatch.startedAt) / 1000);
      }

      // 9. Update DB — only if still in_progress (avoid race conditions)
      const updateRes = await pool.query(
        `UPDATE calls
         SET status = $1,
             summary = $2,
             duration_seconds = COALESCE($3, duration_seconds),
             transcript = COALESCE($4, transcript),
             ended_at = COALESCE(ended_at, NOW())
         WHERE id = $5 AND status = 'in_progress'
         RETURNING id`,
        [newStatus, summary, durationSeconds, transcriptText || null, dbCall.id]
      );

      if (updateRes.rowCount === 0) continue; // Already updated by something else

      // 10. Create notification
      await pool.query(
        `INSERT INTO notifications (type, title, message, related_task_id)
         VALUES ($1, $2, $3, $4)`,
        [
          newStatus === 'completed' ? 'call_completed' : 'call_update',
          `Call ${newStatus}: ${phone}`,
          summary,
          dbCall.task_id || null,
        ]
      );

      // 11. Update linked task if any
      if (dbCall.task_id) {
        const taskStatus = newStatus === 'completed' ? 'completed' : 'failed';
        await pool.query(
          `UPDATE tasks SET status = $1, updated_at = NOW() WHERE id = $2`,
          [taskStatus, dbCall.task_id]
        );
      }

      // 12. Log the sync
      await pool.query(
        `INSERT INTO agent_logs (action, details, status) VALUES ($1, $2, 'success')`,
        [
          'openclaw_call_sync',
          JSON.stringify({
            call_id: dbCall.id,
            openclaw_call_id: bestMatch.callId,
            status: newStatus,
            phone,
            duration: durationSeconds,
            transcript_lines: bestTranscript?.length || 0,
          }),
        ]
      );

      result.synced++;
    }
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : 'Unknown sync error';
    result.errors.push(errMsg);
    console.error('OpenClaw call sync error:', error);
  }

  return result;
}
