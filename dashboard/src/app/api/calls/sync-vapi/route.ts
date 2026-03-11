import { NextResponse } from 'next/server';
import pool from '@/lib/db';

// Sync call data from Vapi API for calls missing transcript/recording
// POST /api/calls/sync-vapi
export async function POST() {
  const vapiApiKey = process.env.VAPI_API_KEY;
  if (!vapiApiKey) {
    return NextResponse.json({ error: 'VAPI_API_KEY not configured' }, { status: 500 });
  }

  try {
    // Find calls with vapi_call_id that are missing transcript or recording
    const missingRes = await pool.query(
      `SELECT id, vapi_call_id FROM calls
       WHERE vapi_call_id IS NOT NULL
         AND (transcript IS NULL OR recording_url IS NULL)
         AND status IN ('completed', 'no_answer', 'failed')
       ORDER BY created_at DESC
       LIMIT 20`
    );

    if (missingRes.rows.length === 0) {
      return NextResponse.json({ synced: 0, message: 'All calls already have data' });
    }

    let synced = 0;
    const errors: string[] = [];

    for (const row of missingRes.rows) {
      try {
        const res = await fetch(`https://api.vapi.ai/call/${row.vapi_call_id}`, {
          headers: { 'Authorization': `Bearer ${vapiApiKey}` },
          signal: AbortSignal.timeout(10000),
        });

        if (!res.ok) {
          errors.push(`${row.vapi_call_id}: HTTP ${res.status}`);
          continue;
        }

        const vapiCall = await res.json() as Record<string, unknown>;

        const transcript = (vapiCall.transcript as string) || null;
        const recordingUrl = (vapiCall.recordingUrl as string) || null;
        let summary = (vapiCall.summary as string) || null;

        // Try analysis.summary if top-level summary is empty
        if (!summary && vapiCall.analysis) {
          summary = ((vapiCall.analysis as Record<string, unknown>).summary as string) || null;
        }

        const durationSeconds = vapiCall.durationSeconds as number | undefined;

        // Only update fields that are currently null
        await pool.query(
          `UPDATE calls
           SET transcript    = COALESCE(transcript, $1),
               recording_url = COALESCE(recording_url, $2),
               summary       = CASE WHEN summary IS NULL OR summary LIKE 'Vapi outbound call:%' THEN $3 ELSE summary END,
               duration_seconds = COALESCE(duration_seconds, $4)
           WHERE id = $5`,
          [transcript, recordingUrl, summary, durationSeconds ?? null, row.id]
        );

        synced++;
      } catch (err) {
        errors.push(`${row.vapi_call_id}: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }

    return NextResponse.json({ synced, total: missingRes.rows.length, errors: errors.length > 0 ? errors : undefined });
  } catch (error) {
    console.error('Vapi sync error:', error);
    return NextResponse.json({ error: 'Failed to sync' }, { status: 500 });
  }
}
